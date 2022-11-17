import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import * as dotenv from 'dotenv'
dotenv.config()
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb'

const app = express()
const port = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

app.get('/api/v1/doctors-portal', async (req, res) => {
    await res.send('Doctors Portal server side running')
})


const uri = `mongodb+srv://${ process.env.DB_USER }:${ process.env.DB_PASS }@cluster0.1ipuukw.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

// Verify JWT Token
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if(!authHeader) {
        return res.status(401).send('Unauthorized Access!')
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.JWT_ACCESS_TOKEN, function(err, decoded){
        if(err) {
            return res.status(403).send({
                message: 'Forbidden Access!'
            })
        }
        req.decoded = decoded
        next()
    })
}


async function dbConnect() {
    try {
        await client.connect()
        console.log('Database Connected')
    } catch (error) {
        console.log(error.name, error.message)
    }
}dbConnect().catch(error => console.log(error.message))

// Database Collection
const AppointmentOption = client.db('doctors_portal').collection('appointmentOption')
const Bookings = client.db('doctors_portal').collection('bookings')
const Users = client.db('doctors_portal').collection('users')

// All API Endpoint
app.get('/api/v1/doctors-portal/appointmentOptions', async (req, res) => {
    try {
        const date = req.query.date
        const cursor = AppointmentOption.find({})
        const appointmentOptions = await cursor.toArray()
        // Get the booking of the provided date
        const bookingQuery = { appointmentDate: date }
        const alreadyBooked = await Bookings.find(bookingQuery).toArray()

        appointmentOptions.forEach(option => {
            const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
            const bookedSlots = optionBooked.map(book => book.slot)
            const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
            option.slots = remainingSlots
        })
        res.send({
            success: true,
            message: 'Successfully got the all Appointment Options data',
            data: appointmentOptions
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

// Version 2 API Release
app.get('/api/v2/doctors-portal/appointmentOptions', async (req, res) => {
    try {
        const date = req.query.date
        const appointmentOptions = await AppointmentOption.aggregate([
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'name',
                    foreignField: 'treatment',
                    pipeline: [ 
                        {
                            $match: {
                                $expr: {
                                    $eq: ['$appointmentDate', date]
                                }
                            }
                        }
                    ],
                    as: 'booked'
                }
            },
            {
                $project: {
                    name: 1,
                    slots: 1,
                    booked: {
                        $map: {
                            input: '$booked',
                            as: 'book',
                            in: '$$book.slot'
                        }
                    }
                }
            },
            {
                $project: {
                    name: 1,
                    slots: {
                        $setDifference: ['$slots', '$booked']
                    }
                }
            }
        ]).toArray()
        res.send({
            success: true,
            message: 'Successfully got the all Appointment Options data',
            data: appointmentOptions
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

// Bookings Create API
app.post('/api/v1/doctors-portal/bookings', async (req, res) => {
    try {
        const bookingData = req.body
        const query = {
            appointmentDate: bookingData.appointmentDate,
            email: bookingData.email,
            treatment: bookingData.treatment
        }
        const alreadyBooked = await Bookings.find(query).toArray()
        if(alreadyBooked.length) {
            return res.send({
                success: false,
                message: `You already have a booking on ${ bookingData.appointmentDate }`
            })
        }
        const bookings = await Bookings.insertOne(bookingData)
        res.send({
            success: true,
            message: 'Successfully create a new booking',
            data: bookings
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

app.get('/api/v1/doctors-portal/bookings', verifyJWT, async (req, res) => {
    try {
        const email = req.query.email
        const decodedEmail = req.decoded.email
        if(email !== decodedEmail) {
            return res.status(403).send({
                message: 'Forbidden Access!'
            })
        }
        const bookings = await Bookings.find({ email: email }).toArray()
        res.send({
            success: true,
            message: 'Successfully get the all booking data',
            data: bookings
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

// JWT Token Get
app.get('/api/v1/doctors-portal/jwt', async (req, res) => {
    const email = req.query.email
    const user = await Users.findOne({ email: email })
    if(user) {
        const token = jwt.sign({ email }, process.env.JWT_ACCESS_TOKEN, { expiresIn: '1d' })
        return res.send({ accessToken: token })
    }
    res.status(403).send({ accessToken: '' })
})

// User API 
app.post('/api/v1/doctors-portal/users', async (req, res) => {
    try {
        const user = req.body
        const users = await Users.insertOne(user)
        res.send({
            success: true,
            message: 'Successfully create a new users',
            data: users
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

//  Display All User Data Load
app.get('/api/v1/doctors-portal/users', async (req, res) => {
    try {
        const users = await Users.find({}).toArray()
        res.send({
            success: true,
            message: 'Successfully get the all Users',
            data: users
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

// Check Admin
app.get('/api/v1/doctors-portal/users/admin/:email', async (req, res) => {
    try {
        const userEmail = req.params.email
        const user = await Users.findOne({ email: userEmail })
        res.send({
            success: true,
            message: 'Successfully get the all Users',
            isAdmin: user?.role === 'Admin'
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})

// User Role update API
app.put('/api/v1/doctors-portal/users/admin/:userId', verifyJWT, async (req, res) => {
    try {
        const decodedEmail = req.decoded.email
        const userRole = await Users.findOne({ email: decodedEmail })
        if(userRole?.role !== 'Admin') {
            return res.status(403).send({
                message: 'Forbidden Access!'
            })
        }

        const userId = req.params.userId
        const userFilter = { _id: ObjectId(userId) }
        const options = { upsert: true }
        const updatedDoc = {
            $set: {
                role: 'Admin'
            }
        }
        const user = await Users.updateOne(userFilter, updatedDoc, options)
        res.send({
            success: true,
            message: 'Successfully change the user role',
            data: user
        })
    } catch (error) {
        res.send({
            success: false,
            error: error.message
        })
    }
})



app.listen(port, () => {
    console.log(`Doctors Portal Server Running on Port ${port}`)
})