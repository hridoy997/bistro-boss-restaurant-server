const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SRCRET_KEY);
const port = process.env.PORT || 5000;

const jwt = require('jsonwebtoken');


// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { config } = require('dotenv');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gresu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db("BistroDB").collection("users");
        const menuCollection = client.db("BistroDB").collection("menu");
        const reviewsCollection = client.db("BistroDB").collection("reviews");
        const cartsCollection = client.db("BistroDB").collection("carts");
        const paymentCollection = client.db("BistroDB").collection("payments");

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h' });
            res.send({ token });
        });

        

        // middlewares

        const veriftToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access' });
            }
            // console.log('Authorization Header:', req.headers.authorization);
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    console.error('JWT verification error:', err);
                    return res.status(401).send({ message: 'Unauthorized Access' });
                }
                req.decoded = decoded; // Attach decoded token to req
                next();
            });
        };
        


        // use verify admin after verify token

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            // console.log('email-->', email);
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            // console.log('Is admin-->', isAdmin);
            if(!isAdmin){
                return res.status(403).send({message: 'Forbidden access'});
            }
            next();
        };


        // users related api 
        app.get('/users', veriftToken, verifyAdmin, async (req, res) => {
            // console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result);
        });


        app.get('/users/admin/:email', veriftToken, async (req, res) => {
            const email = req.params.email;
            // console.log("Incoming request for admin verification:", email);
            if(email !== req.decoded?.email) {
                return res.status(403).send({message: 'Forbidden access'})
            }
            const query = {email: email}
            const user = await userCollection.findOne(query);
            let admin = false;
            if(user){
                admin = user?.role === 'admin';
            }
            res.send({ admin});
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            // inside email if user  doesnt exists:
            // you can do this many ways (1. email unique, 2. upsert, 3. simple checking )
            const query = {email: user.email};
            const existingUser = await userCollection.findOne(query);
            if(existingUser){
                return res.send({message: 'user already exists', insertedId: null});
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', veriftToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)};
            const updateDoc = {
                $set: {
                    role: 'admin',
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.delete('/users/:id',veriftToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });



        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            // console.log(result);
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await menuCollection.findOne(query);
            res.send(result);
        });

        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)};
            const updateDoc ={
                $set: {
                    name: item.name,
                    category: item.category,
                    recipe: item.recipe,
                    price: item.price,
                    image: item.image,
                }
            }
            
            const result = await menuCollection.updateOne(filter, updateDoc);
            res.send(result);

        });

        app.post('/menu', veriftToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result);
        });

        app.delete('/menu/:id', veriftToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            // console.log(result);
            res.send(result);
        });

        // Carts Collection
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartsCollection.insertOne(cartItem);
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        });

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            // console.log("Price:", price, "Amount:", amount);
            const roundedAmount = Math.round(amount);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: roundedAmount,
                currency: "usd",
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.get('/payments', async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        app.get('/payments/:email', veriftToken, async (req, res) => {
            const query = {email: req.params.email};
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({message: 'Forbidden Access'});
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            //carefully delete each item from the cart
            const query = {_id: {
                $in: payment.cartIds.map(id => new ObjectId(id)),
            }};
            const deleteResult = await cartsCollection.deleteMany(query);

            // console.log('payment info ', payment);
            console.log('delete ', deleteResult);

            res.send({paymentResult, deleteResult});

        })

        // status or analytics
        app.get('/admin-status',veriftToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price , 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result[0]?.totalRevenue || 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
            });
        });


        app.get('/order-status',veriftToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                // Unwind menuItemIds
                {
                    $unwind: '$menuItemIds'
                },
                // Lookup menu details
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                // Unwind menuItems
                {
                    $unwind: '$menuItems'
                },
                // Group by menuItems.category
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItems.price' },
                    }
                },
                // Project the final output
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue',
                    }
                }
            ]).toArray();
            
            res.send(result);
        });



        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } finally {

    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Bistro-Boss-Restaurant is Rinning');
});

app.listen(port, () => {
    console.log(`Bistro Boss is Sitting on Port ${port}`);
});

