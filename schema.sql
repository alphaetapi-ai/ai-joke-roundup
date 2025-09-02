-- Joke Generator Database Schema

-- Models table to store LLM model information
CREATE TABLE models (
    model_id INT AUTO_INCREMENT PRIMARY KEY,
    model_name VARCHAR(128) NOT NULL,
    UNIQUE KEY unique_model (model_name)
);

-- Topics table to store unique topics
CREATE TABLE topics (
    topic_id INT AUTO_INCREMENT PRIMARY KEY,
    topic VARCHAR(64) NOT NULL,
    date_suggested DATE DEFAULT (CURRENT_DATE),
    UNIQUE KEY unique_topic (topic)
);

-- Jokes table to store generated jokes
CREATE TABLE jokes (
    joke_id INT AUTO_INCREMENT PRIMARY KEY,
    topic_id INT NOT NULL,
    model_id INT NOT NULL,
    type ENUM('normal', 'story', 'limerick') NOT NULL,
    joke_content TEXT NOT NULL,
    explanation TEXT NOT NULL,
    date_created DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(model_id) ON DELETE CASCADE,
    INDEX idx_topic_id (topic_id),
    INDEX idx_model_id (model_id),
    INDEX idx_type (type),
    INDEX idx_date_created (date_created)
);