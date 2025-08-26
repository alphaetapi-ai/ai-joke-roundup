import express from 'express';
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

app.post('/get_joke', (req, res) => {
  const topic = req.body.topic;
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
        <h1>Your Joke Request</h1>
        <p>You want a joke about <strong>${topic}</strong>...</p>
        <p><a href="/">← Back to joke generator</a></p>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});