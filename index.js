const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose")
const dotenv = require("dotenv");
const userRoutes = require('./routes/userRoutes');
const Message = require("./models/messageModel");
const User = require("./models/userModel");

const rooms = ["World", "Bangalore", "Chennai", "Mumbai", "Delhi", "America", "Australia", "Goa"];

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cors());

app.use('/users', userRoutes)

//Connect with DB
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(() => {

    console.log("Connected to DB!");

}).catch((error) => {

    console.log(error.message);
    
});

//create server
const server = require("http").createServer(app);


const io = require("socket.io")(server, {
    cors: {
        origin: 'https://enchanting-sprite-cbb1aa.netlify.app',
        methods: ['GET', 'POST']
    }
});

async function getLastMessagesFromRoom(room){
    let roomMessages = await Message.aggregate([
      {$match: {to: room}},
      {$group: {_id: '$date', messagesByDate: {$push: '$$ROOT'}}}
    ])
    return roomMessages;
}

function sortRoomMessagesByDate(messages){
    return messages.sort(function(a, b){
      let date1 = a._id.split('/');
      let date2 = b._id.split('/');
  
      date1 = date1[2] + date1[0] + date1[1]
      date2 =  date2[2] + date2[0] + date2[1];
  
      return date1 < date2 ? -1 : 1
    })
}

io.on('connection', (socket)=> {

    socket.on('new-user', async ()=> {
      const members = await User.find();
      io.emit('new-user', members)
    })
  
    socket.on('join-room', async(newRoom, previousRoom)=> {
      socket.join(newRoom);
      socket.leave(previousRoom);
      let roomMessages = await getLastMessagesFromRoom(newRoom);
      roomMessages = sortRoomMessagesByDate(roomMessages);
      socket.emit('room-messages', roomMessages)
    })
  
    socket.on('message-room', async(room, content, sender, time, date) => {
      const newMessage = await Message.create({content, from: sender, time, date, to: room});
      let roomMessages = await getLastMessagesFromRoom(room);
      roomMessages = sortRoomMessagesByDate(roomMessages);
      // sending message to room
      io.to(room).emit('room-messages', roomMessages);
      socket.broadcast.emit('notifications', room)
    })
  
    app.delete('/logout', async(req, res)=> {
      try {
        const {_id, newMessages} = req.body;
        const user = await User.findById(_id);
        user.status = "Offline";
        user.newMessages = newMessages;
        await user.save();
        const members = await User.find();
        socket.broadcast.emit('new-user', members);
        res.status(200).send();
      } catch (e) {
        console.log(e);
        res.status(400).send()
      }
    })
  
  })

app.get('/rooms', (req, res)=> {
    res.json(rooms)
});

app.get('/', (req, res)=>{
  res.send("Hello World");
})

const port = process.env.PORT||5000;

server.listen(port, () => {
    console.log(`Serve running at Port:${port}`);
});