const fs = require('fs')
const express = require('express')
const line = require('@line/bot-sdk')
const { Configuration, OpenAIApi } = require("openai")


//-------------------- ChatGPT APIs --------------------//

const chatCompletion = async (line_message, userId, openai) => {

  const user_input = line_message

  const messages = []

  for (const [input_text, completion_text] of history[userId].messagelog) {
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

    if (history[userId].activeDirective === '請輸入你的API金鑰') {
      return '📢系統訊息:\n您的ChatGPT已上線 🤖'
    } else if (user_input === '/註冊') {
      return '📢系統訊息:\n你已經完成註冊了 👽'
    } else {
      history[userId].messagelog.push([user_input, completion_text])
      console.log(`ChatGPT: ${completion_text}\n`)
      return `🤖ChatGPT:\n${completion_text}`
    }
  } catch (error) {
    if (error.message.startsWith('Invalid character in header content')) {
      history[userId].activeErrorMessage = '無效的API金鑰'
      throw 'System: 無效的API金鑰\n'
    } else if (error.response.data.error.code === 'invalid_api_key') {
      history[userId].activeErrorMessage = '無效的API金鑰'
      throw 'System: 無效的API金鑰\n'
    } else if (error.response.data.error.message.startsWith("You didn't provide an API key.")) {
      history[userId].activeErrorMessage = '請先註冊API金鑰'
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
    if (error.response.data.error.message.startsWith("You didn't provide an API key.")) {
      history[userId].activeErrorMessage = '請先註冊API金鑰'
      throw 'System: 請先註冊API金鑰\n'
    } else {
      console.log(error.message)
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

//Save user's prompt history
const history = {}

//Register a webhook handler with middleware
app.post('/callback', line.middleware(config), (req, res) => {
  const userId = req.body.events[0].source.userId
  const messageType = req.body.events[0].message.type
  const user_input = req.body.events[0].message.text

  //Initialize User's data
  if (history[userId] === undefined) {
    history[userId] = {
      apiKey: '',
      messageCount: 0,
      messagelog: [],
      activeDirective: '',
      activeErrorMessage: ''
    }
  }

  if (messageType === 'audio' || messageType === 'video') {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
      })
      .catch((error) => {
        history[userId].activeErrorMessage = '請先註冊API金鑰'
        console.error(error)
        Promise
          .all(req.body.events.map(handleErrorEvent))
          .then(() => {
            history[userId].activeErrorMessage = ''
          })
        res.status(500).end()
      })
  } else if (user_input === '/註冊') {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
        console.log('System: 你已經完成註冊了\n')
      })
      .catch(() => {
        console.error('System: 請輸入你的API金鑰\n')
        handleErrorEvent(req.body.events[0]).then(() => {
          history[userId].activeErrorMessage = ''
          history[userId].activeDirective = '請輸入你的API金鑰'
        })
      })
  } else if (history[userId].activeDirective === '請輸入你的API金鑰') {
    history[userId].apiKey = user_input
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
        history[userId].activeDirective = ''
        console.log('System: 註冊成功\n')
      })
      .catch((error) => {
        console.error(error)
        handleErrorEvent(req.body.events[0]).then(() => {
          history[userId].apiKey = ''
          history[userId].activeDirective = ''
        })
      })
  } else {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
      })
      .catch((error) => {
        console.error(error)
        handleErrorEvent(req.body.events[0]).then(() => {
          history[userId].activeErrorMessage = ''
        })
      })
  }
})

//Error event handler
async function handleErrorEvent(event) {
  const user_id = event.source.userId
  const errorMessage = history[user_id].activeErrorMessage
  
  //Ignore non-message event
  if (event.type !== 'message') {
    return Promise.resolve(null)
  }

  //Use Line reply API to reply error message
  let reply = {}
  if (errorMessage === '請先註冊API金鑰' && event.message.text === '/註冊') {
    reply = { type: 'text', text: '📢系統訊息:\n請輸入你的API金鑰 👇' }
  } else if (errorMessage === '無效的API金鑰') {
    reply = { type: 'text', text: '📢系統訊息:\n無效的API金鑰 💀' }
  } else if (errorMessage === '請先註冊API金鑰') {
    reply = { type: 'text', text: '📢系統訊息:\n請先註冊API金鑰 ❗' }
  }
  return client.replyMessage(event.replyToken, reply)
}

//Request event handler
async function handleEvent(event) {
  const user_id = event.source.userId
  const event_type = event.type
  const input_type = event.message.type
  const user_input = event.message.text

  //Initialize OpenAI configuration
  const configuration = new Configuration({
    apiKey: history[user_id].apiKey
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
  } else if (input_type === 'audio') {

    //Use Line getMessageContent API to download the audio content
    await client.getMessageContent(event.message.id)
      .then((response) => {
        const file_path = `./audio_temp/${user_id}.m4a`
        response.pipe(fs.createWriteStream(file_path))
        console.log('System: 檔案下載成功')
      })
      .catch((error) => {
        console.error(error)
      })

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