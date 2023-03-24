const { Configuration, OpenAIApi } = require("openai");
const readlineSync = require("readline-sync");
require("dotenv").config();


//-------------------- Initialize --------------------//

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const history = [];

//-------------------- Request --------------------//

const chatCompletion = async () => {
    while (true) {
        const user_input = readlineSync.question("Your input: ");

        if (user_input.toLowerCase() === 'exit') {
            break
        }

        const messages = [];

        for (const [input_text, completion_text] of history) {
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

            console.log(completion_text)

            history.push([user_input, completion_text]);

        } catch (error) {
            if (error.response) {
                console.log(error.response.status);
                console.log(error.response.data);
            } else {
                console.log(error.message);
            }
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

chatCompletion()