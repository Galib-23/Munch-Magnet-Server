const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var jwt = require('jsonwebtoken');
const stripe = require('stripe')('sk_test_51OIDyHDbmhpZKeGXQPdNpb4JK3JKaaGbkUc3cOYarv574zh2HWuNDmLbuLrqkxF7Zy4L5PalydNKHZ5dKrr9Nqfe00DXGXQqug')
// require('crypto').randomBytes(64).toString('hex')
require('dotenv').config()
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ogz7mxs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // await client.connect();
    const menuCollection = client.db("munchDB").collection("menu");
    const userCollection = client.db("munchDB").collection("users");
    const reviewCollection = client.db("munchDB").collection("reviews");
    const cartCollection = client.db("munchDB").collection("carts");
    const paymentCollection = client.db("munchDB").collection("payments");


    //-------------JWT RELATED API-----------
    app.post('/jwt', async (req, res) => {
      const user = req.body; // Payload
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '3h'
      });
      res.send({ token });
    })



    //-----------------MIDDLEWARES---------------
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) { //in client side, inside axios headers we named the token field as authorization
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }



    //------GETSSSS------
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      admin = user?.role === 'admin';
      res.send({ admin });
    })
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })
    app.get('/menu/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: id };
        const result = await menuCollection.findOne(query);
        res.send(result);
    });
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      //recieving token from frontend to load users
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    })
    app.get('/payments/:email', verifyToken,  async (req, res) => {
      const query = {email: req.params.email};
      console.log('params email: ',req.params.email);
      if(req.params.email != req.decoded.email){
        return res.status(403).send({message: 'forbidden access'});
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })



    //------POSTSSS------
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })
    app.post('/users', async (req, res) => {
      const user = req.body;

      //check if email already exists
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User Already Exists', insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    })
    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    })

    //////---------------PAYMENT INTENT-----------------////////
    app.post('/create-payment-intent', async(req, res)=> {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log('amount : ', amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      
      //carefully delete each Item from the cart
      const query = {
        _id:{
          $in: payment.cartIds.map(id => new  ObjectId(id))
        }
      };
      const deleteResult = await cartCollection.deleteMany(query);


      res.send({paymentResult, deleteResult});
    })



    //------PATCH--------
    //=====MAKE ADMIN=====
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: id};
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })



    //------DELETESS------
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      console.log("cart id: ", id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })
    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await menuCollection.deleteOne(query);
      console.log('result: ', result);
      res.send(result);
    })



    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('munch magnet running');
})
app.listen(port, () => {
  console.log(`Munch Magnet Running On Port ${port}`);
})