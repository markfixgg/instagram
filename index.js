const { Worker, workerData } = require('worker_threads');
const express = require('express')
bodyParser = require('body-parser')
const app = express()
const port = 3000
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())


const startWorker = async (workerData, callback) => {
    const worker = new Worker('./worker/index.js', {workerData})

    worker.on('message', async (value) => {
        await worker.terminate()
        callback(null, value)
    })

    worker.on('exit', (exitCode) => {
        // console.log('Exited');
    })
    worker.on('error', (error) => {
        console.log(error);
    })
}



app.post('/login', async (req, res) => {
    const {username, password, proxy} = req.body;
    if(!username || !password || !proxy) return res.send("Missing credentials")
    await startWorker({username, password, proxy}, (err, result) => {
        res.send(result)
    })
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})