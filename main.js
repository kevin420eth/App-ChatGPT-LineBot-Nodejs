const { Configuration, OpenAIApi } = require("openai");
const line = require('@line/bot-sdk');
const express = require('express');
readlineSync = require('readline-sync');

require("dotenv").config();

//-------------------- Initialize --------------------//

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

//-------------------- Request --------------------//

const chatCompletion = async (line_message, userId, openai) => {

  const user_input = line_message

  const messages = [];

  for (const [input_text, completion_text] of history[userId].messagelog) {
    messages.push({ role: "user", content: input_text });
    messages.push({ role: "assistant", content: completion_text });
  }

  messages.push({ role: "user", content: user_input });

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

    history[userId].messagelog.push([user_input, completion_text]);

    if (history[userId].activeDirective === '請輸入你的API金鑰') {
      return '📢系統訊息:\n您的ChatGPT已上線 🤖'
    }else if(user_input==='/註冊'){
      return '📢系統訊息:\n你已經完成註冊了 👽'
    } else {
      console.log(`ChatGPT: ${completion_text}\n`)
      return `🤖ChatGPT:\n${completion_text}`
    }


  } catch (error) {
    if (error.response.data.error.code === 'invalid_api_key') {
      throw 'System: 無效的API金鑰\n'
    } else if (error.response.data.error.message.startsWith("You didn't provide an API key.")) {
      throw 'System: 請先註冊API金鑰\n'
    } else if (error.response) {
      console.log(error.response.status);
      console.log(error.response.data);
    } else {
      console.log(error.message);
    }
  }
}

const creatImage = async () => {
  const response = await openai.createImage({
    prompt: "Litte mermaid Ariel",
    n: 1,
    size: "1080x1080",
    //response_format:"",
    //user:""
  });
  console.log(`Here's your image's URL:\n${response.data.data[0].url}`)
}

/*-------------------- Line --------------------*/
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// create LINE SDK client
const client = new line.Client(config);

// create Express app
const app = express();

//Save user's prompt history
const history = {};

// register a webhook handler with middleware
app.post('/callback', line.middleware(config), (req, res) => {
  const userId = req.body.events[0].source.userId

  if (history[userId] === undefined) {
    history[userId] = {
      apiKey: '',
      messageCount: 0,
      messagelog: [],
      activeDirective: '',
      activeErrorMessage: ''
    }
  }

  const user_input = req.body.events[0].message.text
  if (user_input === '/註冊') {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
        console.log('System: 你已經完成註冊了\n')
      })
      .catch((err) => {
        history[userId].activeErrorMessage = '準備註冊'
        console.error(err);
        Promise
          .all(req.body.events.map(handleErrorEvent))
          .then(() => {
            history[userId].activeErrorMessage=''
            history[userId].activeDirective = '請輸入你的API金鑰'
          })
        res.status(500).end();
      });
  } else if (history[userId].activeDirective === '請輸入你的API金鑰') {
    history[userId].apiKey = user_input
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
        history[userId].activeDirective = ''
        console.log('System: 註冊成功\n')
      })
      .catch((err) => {
        history[userId].activeErrorMessage = '無效的API金鑰'
        console.error(err);
        res.status(500).end();
        history[userId].apiKey = ''
        history[userId].activeDirective = ''
        Promise
          .all(req.body.events.map(handleErrorEvent))
          .then(() => {
            history[userId].activeErrorMessage=''
          })
        res.status(500).end();
      });
  } else {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => {
        res.json(result)
      })
      .catch((err) => {
        history[userId].activeErrorMessage = '請先註冊API金鑰'
        console.error(err);
        Promise
          .all(req.body.events.map(handleErrorEvent))
          .then(() => {
            history[userId].activeErrorMessage=''
          })
        res.status(500).end();
      });
  }
});

// Rigister event handler
async function handleErrorEvent(event) {
  const user_id = event.source.userId
  // ignore non-text-message event
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // use reply API
  let reply = {}
  if (history[user_id].activeErrorMessage === '準備註冊') {
    reply = { type: 'text', text: '📢系統訊息:\n請輸入你的API金鑰 👇' }
  } else if (history[user_id].activeErrorMessage === '無效的API金鑰') {
    reply = { type: 'text', text: '📢系統訊息:\n無效的API金鑰 💀' }
  } else if (history[user_id].activeErrorMessage === '請先註冊API金鑰') {
    reply = { type: 'text', text: '📢系統訊息:\n請先註冊API金鑰 ❗' }
  }

  return client.replyMessage(event.replyToken, reply);
}

// Chat event handler
async function handleEvent(event) {
  const user_id = event.source.userId
  const user_input = event.message.text

  // Initialize OpenAI
  const configuration = new Configuration({
    apiKey: history[user_id].apiKey,
  });
  const openai = new OpenAIApi(configuration);

  // ignore non-text-message event
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // create a bot reply text message
  console.log(`User: ${user_input}`)
  const gpt_reply = await chatCompletion(user_input, user_id, openai)
  const reply = { type: 'text', text: gpt_reply }

  // use reply API
  return client.replyMessage(event.replyToken, reply);
}

//Confirm working status
app.get('/', (req, res) => {
  res.send('ChatGPT is listening...');
});

// listen on port
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`listening on ${port}`);
});