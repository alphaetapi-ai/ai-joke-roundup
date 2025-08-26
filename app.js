import express from 'express';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Joke Generator</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
            }
            input[type="text"] {
                padding: 10px;
                font-size: 16px;
                width: 300px;
                margin: 10px;
                border: 2px solid #ccc;
                border-radius: 4px;
            }
            button {
                padding: 10px 20px;
                font-size: 16px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: #45a049;
            }
        </style>
    </head>
    <body>
        <h1>Joke Generator</h1>
        <p>What would you like your joke to be about?</p>
        <form action="/get_joke" method="POST">
            <input type="text" name="topic" maxlength="40" placeholder="Enter a topic..." required>
            <br>
            <button type="submit">Tell me my joke</button>
        </form>
    </body>
    </html>
  `);
});

app.post('/get_joke', async (req, res) => {
  const topic = req.body.topic;
  
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.2:latest',
        prompt: `Tell me a joke about ${topic}. Reply with just the joke.`,
        stream: false
      })
    });

    const data = await response.json();
    const joke = data.response;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Joke</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  max-width: 600px;
                  margin: 50px auto;
                  padding: 20px;
                  text-align: center;
              }
              .joke {
                  background-color: #f9f9f9;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
                  font-size: 18px;
                  line-height: 1.6;
              }
              a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              a:hover {
                  text-decoration: underline;
              }
          </style>
      </head>
      <body>
          <h1>Your Joke About "${topic}"</h1>
          <div class="joke">${joke}</div>
          <p><a href="/">← Get another joke</a></p>
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  max-width: 600px;
                  margin: 50px auto;
                  padding: 20px;
                  text-align: center;
              }
              .error {
                  color: #d32f2f;
                  background-color: #ffebee;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
              }
              a {
                  color: #4CAF50;
                  text-decoration: none;
              }
              a:hover {
                  text-decoration: underline;
              }
          </style>
      </head>
      <body>
          <h1>Oops!</h1>
          <div class="error">
              Sorry, I couldn't generate a joke right now. Make sure Ollama is running!
          </div>
          <p><a href="/">← Try again</a></p>
      </body>
      </html>
    `);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});