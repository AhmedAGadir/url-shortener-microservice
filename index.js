require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
const { URL } = require('url');
const { json, urlencoded } = require('body-parser');

const app = express();

// Connect to MongoDB database
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Database connection successful');
  })
  .catch((err) => {
    console.error('Database connection error:', err);
  });

// Define counter schema and model
const counterSchema = new mongoose.Schema({
  _id: String,
  sequence_value: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', counterSchema);

// Define URL schema and model
const urlSchema = new mongoose.Schema({
  original_url: {
    type: String,
    required: true,
  },
  short_url: {
    type: Number,
    required: true,
    unique: true, // Enforce uniqueness for short_url
  },
});
const Url = mongoose.model('Url', urlSchema); // Use a clear name to avoid conflicts

// Basic configuration
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Middleware for parsing form data and JSON
app.use(urlencoded({ extended: false }));
app.use(json());

// Serve static assets
app.use('/public', express.static(`${process.cwd()}/public`));

// Serve the index page
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Function to get the next sequence value
const getNextSequenceValue = async (counterName) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: counterName }, // Filter by counter name
    { $inc: { sequence_value: 1 } }, // Increment the sequence value
    { new: true, upsert: true } // Return updated document or create it if not found
  );
  return counter.sequence_value;
};

// URL shortening API
app.post('/api/shorturl', async (req, res) => {
  const inputUrl = req.body.url;

  try {
    // Parse and validate the URL
    const parsedUrl = new URL(inputUrl);

    // Ensure the URL has a valid protocol
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.error(`Invalid protocol detected: ${parsedUrl.protocol}`);
      return res.json({ error: 'invalid url' });
    }

    // Perform DNS lookup on the hostname
    dns.lookup(parsedUrl.hostname, async (err, address) => {
      if (err) {
        console.log('DNS lookup failed for hostname:', parsedUrl.hostname);
        return res.json({ error: 'invalid url' });
      }

      console.log('DNS lookup successful. IP address:', address);

      try {
        // Check if the URL already exists
        const existingUrl = await Url.findOne({ original_url: inputUrl });
        if (existingUrl) {
          return res.json({
            original_url: existingUrl.original_url,
            short_url: existingUrl.short_url,
          });
        }

        // Generate the next sequence value
        const short_url = await getNextSequenceValue('sequence_value');

        // Save the new URL and short ID
        const newUrl = new Url({
          original_url: inputUrl,
          short_url,
        });
        await newUrl.save();

        // Return the shortened URL
        res.json({ original_url: inputUrl, short_url });
      } catch (error) {
        console.error('Error saving URL:', error);
        res.status(500).send('Error creating shortened URL');
      }
    });
  } catch (err) {
    console.log('Invalid URL format:', inputUrl);
    return res.json({ error: 'invalid url' });
  }
});

// Redirect API for shortened URLs
app.get('/api/shorturl/:short_url', async (req, res) => {
  const short_url = parseInt(req.params.short_url, 10); // Ensure short_url is a number

  try {
    const doc = await Url.findOne({ short_url }); // Query by short_url
    if (doc) {
      const original_url = doc.original_url;
      console.log('Redirecting to:', original_url);
      return res.redirect(original_url);
    } else {
      return res.json({ error: 'Short URL not found' });
    }
  } catch (err) {
    console.error('Error fetching short_url:', err);
    return res.json({ error: 'invalid url' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});