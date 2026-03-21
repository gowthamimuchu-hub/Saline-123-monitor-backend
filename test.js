<<<<<<< HEAD
const { MongoClient } = require('mongodb');

// Replace YOUR_PASSWORD with your MongoDB password
const uri = "mongodb+srv://Salinesure:Saline_123@cluster0.ser67vh.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("SUCCESS! Connected to MongoDB Atlas.");
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await client.close();
  }
}
// ... existing code ...

run().catch(console.dir);

// ADD THIS BELOW:
setInterval(() => {
    console.log("Keep-alive: Backend is running...");
=======
const { MongoClient } = require('mongodb');

// Replace YOUR_PASSWORD with your MongoDB password
const uri = "mongodb+srv://Salinesure:Saline_123@cluster0.ser67vh.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("SUCCESS! Connected to MongoDB Atlas.");
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await client.close();
  }
}
// ... existing code ...

run().catch(console.dir);

// ADD THIS BELOW:
setInterval(() => {
    console.log("Keep-alive: Backend is running...");
>>>>>>> 61b919a33e831788ffdfd6ff2f57bc0996ba8640
}, 60000); // This prints a message every 1 minute