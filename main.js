const fs = require('fs')
const express = require('express')
const line = require('@line/bot-sdk')
const { Configuration, OpenAIApi } = require("openai")


//-------------------- ChatGPT APIs --------------------//

const chatCompletion = async (line_message, userId, openai) => {

    const user_input = line_message

    const messages = []

    for (const [input_text, completion_text] of userData[userId].messagelog) {
        messages.push({ role: "user", content: input_text })
        messages.push({ role: "assistant", content: completion_text })
    }

    messages.push({ role: "user", content: user_input })

    try {
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: messages,
            temperature: 1,
            top_p: 1,
            n: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            //stream: false,
            //stop: null,
            //max_tokens: Infinity,
            //logit_bias:null,
            //user:""
        })

        const completion_text = response.data.choices[0].message.content

        if (userData[userId].activeDirective === '請輸入你的API金鑰') {
            return '📢系統訊息:\n您的ChatGPT已上線 🤖'
        } else if (user_input === '/註冊') {
            return '📢系統訊息:\n你已經完成註冊了 👽'
        } else {
            userData[userId].messagelog.push([user_input, completion_text])
            console.log(`ChatGPT: ${completion_text}\n`)
            return `🤖ChatGPT:\n${completion_text}`
        }
    } catch (error) {
        if (error.message.startsWith('Invalid character in header content') || error.response.data.error.code === 'invalid_api_key') {
            userData[userId].activeErrorMessage = '無效的API金鑰 💀'
            throw 'System: 無效的API金鑰\n'
        } else if (error.response.data.error.message.startsWith("You didn't provide an API key.")) {
            userData[userId].activeErrorMessage = '請先註冊API金鑰 🔑'
            throw 'System: 請先註冊API金鑰\n'
        } else if (error.response) {
            console.log(error.response.status)
            console.log(error.response.data)
        } else {
            console.log(error.message)
        }
    }
}

const createTranscription = async (userId, openai) => {
    try {
        const response = await openai.createTranscription(
            fs.createReadStream(`./audio_temp/${userId}.m4a`),
            "whisper-1"
        )
        const translted_text = response.data.text
        return translted_text
    } catch (error) {
        if (error.message === 'Request body larger than maxBodyLength limit') {
            userData[userId].activeErrorMessage = '檔案大小超過限制 📂'
            throw 'System: 檔案大小超過限制\n'
        }
        else if (error.response.data.error.message.startsWith("You didn't provide an API key.")) {
            userData[userId].activeErrorMessage = '請先註冊API金鑰 🔑'
            throw 'System: 請先註冊API金鑰\n'
        } else {
            userData[userId].activeErrorMessage = '發生錯誤,請再試一次'
            throw `System: ${error.message}/n`
        }
    } finally {
        try {
            fs.unlinkSync(`./audio_temp/${userId}.m4a`)
            console.log(`System: 檔案刪除成功`)
        } catch (error) {
            console.log(`System: 檔案刪除失敗`)
        }
    }
}

//-------------------- Line --------------------//

//Set Line configuration
const config = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
}

//Create Line SDK client
const client = new line.Client(config)

//Create Express app
const app = express()

//Save user's prompt userData
const userData = {}

//Register a webhook handler with middleware
app.post('/callback', line.middleware(config), (req, res) => {
    const userId = req.body.events[0].source.userId
    const messageType = req.body.events[0].message.type
    const user_input = req.body.events[0].message.text

    //Initialize User's data
    if (userData[userId] === undefined) {
        userData[userId] = {
            apiKey: '',
            messageCount: 0,
            messagelog: [],
            activeDirective: '',
            activeErrorMessage: ''
        }
    }

    if (messageType === 'audio' || messageType === 'video') {
        Promise
            .all(req.body.events.map(handleRequestEvent))
            .then((result) => {
                res.json(result)
            })
            .catch((error) => {
                console.error(error)
                handleErrorEvent(req.body.events[0]).then(() => {
                    userData[userId].activeErrorMessage = ''
                })
            })
    } else if (user_input === '/註冊') {
        Promise
            .all(req.body.events.map(handleRequestEvent))
            .then((result) => {
                res.json(result)
                console.log('System: 你已經完成註冊了\n')
            })
            .catch(() => {
                console.error('System: 請輸入你的API金鑰\n')
                handleErrorEvent(req.body.events[0]).then(() => {
                    userData[userId].activeErrorMessage = ''
                    userData[userId].activeDirective = '請輸入你的API金鑰'
                })
            })
    } else if (userData[userId].activeDirective === '請輸入你的API金鑰') {
        userData[userId].apiKey = user_input
        Promise
            .all(req.body.events.map(handleRequestEvent))
            .then((result) => {
                res.json(result)
                userData[userId].activeDirective = ''
                console.log('System: 註冊成功\n')
            })
            .catch((error) => {
                console.error(error)
                handleErrorEvent(req.body.events[0]).then(() => {
                    userData[userId].activeErrorMessage = ''
                    userData[userId].apiKey = ''
                    userData[userId].activeDirective = ''
                })
            })
    } else {
        Promise
            .all(req.body.events.map(handleRequestEvent))
            .then((result) => {
                res.json(result)
            })
            .catch((error) => {
                console.error(error)
                handleErrorEvent(req.body.events[0]).then(() => {
                    userData[userId].activeErrorMessage = ''
                })
            })
    }
})

//Error event handler
async function handleErrorEvent(event) {
    const user_id = event.source.userId
    const errorMessage = userData[user_id].activeErrorMessage

    //Ignore non-message event
    if (event.type !== 'message') {
        return Promise.resolve(null)
    }

    //Use Line reply API to reply error message
    let reply = {}
    if (errorMessage === '請先註冊API金鑰 🔑' && event.message.text === '/註冊') {
        reply = { type: 'text', text: '📢系統訊息:\n請輸入你的API金鑰 👇' }
    } else {
        reply = { type: 'text', text: `📢系統訊息:\n${errorMessage}` }
    }
    return client.replyMessage(event.replyToken, reply)
}

//Request event handler
async function handleRequestEvent(event) {
    const user_id = event.source.userId
    const event_type = event.type
    const input_type = event.message.type
    const user_input = event.message.text

    //Initialize OpenAI configuration
    const configuration = new Configuration({
        apiKey: userData[user_id].apiKey
    })
    const openai = new OpenAIApi(configuration)

    //Ignore non-message event
    if (event_type !== 'message') {
        return Promise.resolve(null)
    } else if (input_type === 'text') {

        //Request chatGPT with a response
        console.log(`User: ${user_input}`)
        const gpt_reply = await chatCompletion(user_input, user_id, openai)
        const reply = { type: 'text', text: gpt_reply }

        //Use Line reply API to send clients message
        return client.replyMessage(event.replyToken, reply)
    } else if (input_type === 'audio' || input_type === 'video') {

        //Use Line getMessageContent API to retrieve the audio content
        //and write the content of the audio message to the file synchronously
        const stream = await client.getMessageContent(event.message.id);
        try {
            const data = await new Promise((resolve, reject) => {
                const chunks = [];
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('error', (error) => reject(error));
                stream.on('end', () => resolve(Buffer.concat(chunks)));
            });
            fs.writeFileSync(`./audio_temp/${user_id}.m4a`, data);
            console.log('System: 檔案下載成功');
        } catch (error) {
            console.error('System: 檔案下載失敗');
        }

        //Call transcripton API to translate user's input
        const translated_input = await createTranscription(user_id, openai)
        console.log('System: 翻譯完成')

        //Request chatGPT with a response
        console.log(`User: ${translated_input}`)
        const gpt_reply = await chatCompletion(translated_input, user_id, openai)
        const reply = { type: 'text', text: gpt_reply }

        //Use Line reply API to send clients message
        return client.replyMessage(event.replyToken, reply)
    } else {
        return Promise.resolve(null)
    }
}

//Confirm working status
app.get('/', (req, res) => {
    res.send('ChatGPT is listening...')
})

//Listen on the port
const port = process.env.PORT || 3000
app.listen(port, () => {
    console.log(`listening on ${port}`)
})