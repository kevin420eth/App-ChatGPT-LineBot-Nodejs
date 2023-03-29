const { Configuration, OpenAIApi } = require("openai");
const line = require('@line/bot-sdk');
const express = require('express');

require("dotenv").config();

//-------------------- Initialize --------------------//

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

//-------------------- Request --------------------//

const chatCompletion = async (line_message, userId) => {

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

        console.log(`${completion_text}\n`)
        return completion_text

    } catch (error) {
        if (error.response) {
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
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// event handler
async function handleEvent(event) {

    //Create user's chat history log if it's the first time user talk
    const userId = event.source.userId
    if (history[userId] === undefined) {
        history[userId] = {
            apiKey: '',
            messageCount: 0,
            messagelog: []
        }
    }

    // ignore non-text-message event
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    // create a bot reply text message
    const prompt = event.message.text
    console.log(prompt)
    const gpt_reply = await chatCompletion(prompt, userId)
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