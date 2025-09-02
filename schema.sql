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
    stem_topic_id INT NOT NULL,
    date_suggested DATE DEFAULT (CURRENT_DATE),
    UNIQUE KEY unique_topic (topic),
    FOREIGN KEY (stem_topic_id) REFERENCES stem_topic(stem_topic_id) ON DELETE CASCADE,
    INDEX idx_stem_topic_id (stem_topic_id)
);

-- Stem topics table to store stemmed topic variations
CREATE TABLE stem_topic (
    stem_topic_id INT AUTO_INCREMENT PRIMARY KEY,
    topic_example VARCHAR(64) NOT NULL,
    topic_stemmed VARCHAR(64) NOT NULL,
    visible BOOLEAN DEFAULT TRUE,
    date_suggested DATE DEFAULT (CURRENT_DATE),
    UNIQUE KEY unique_stem (topic_stemmed)
);

-- Jokes table to store generated jokes
CREATE TABLE jokes (
    joke_id INT AUTO_INCREMENT PRIMARY KEY,
    topic_id INT NOT NULL,
    model_id INT NOT NULL,
    stem_topic_id INT NOT NULL,
    type ENUM('normal', 'story', 'limerick') NOT NULL,
    joke_content TEXT NOT NULL,
    explanation TEXT NOT NULL,
    rating_funny INT DEFAULT 0,
    rating_okay INT DEFAULT 0,
    rating_dud INT DEFAULT 0,
    date_created DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(model_id) ON DELETE CASCADE,
    FOREIGN KEY (stem_topic_id) REFERENCES stem_topic(stem_topic_id) ON DELETE CASCADE,
    INDEX idx_topic_id (topic_id),
    INDEX idx_model_id (model_id),
    INDEX idx_stem_topic_id (stem_topic_id),
    INDEX idx_type (type),
    INDEX idx_date_created (date_created)
);

-- Joke votes table to track user ratings
CREATE TABLE joke_votes (
    vote_id INT AUTO_INCREMENT PRIMARY KEY,
    joke_id INT NOT NULL,
    visitor_string VARCHAR(255) NOT NULL,
    rating ENUM('funny', 'okay', 'dud') NOT NULL,
    vote_date DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (joke_id) REFERENCES jokes(joke_id) ON DELETE CASCADE,
    UNIQUE KEY unique_joke_visitor_date (joke_id, visitor_string, vote_date),
    INDEX idx_joke_id (joke_id),
    INDEX idx_rating (rating),
    INDEX idx_vote_date (vote_date)
);