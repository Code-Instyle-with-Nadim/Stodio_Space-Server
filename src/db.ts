import { MongoClient, Db } from "mongodb";
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);
let db: Db;
export async function connectDB() {
  await client.connect();
  db = client.db(process.env.DB_NAME || "studiospace");
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db
    .collection("bookings")
    .createIndex({ studioId: 1, date: 1, status: 1 });
  console.log("MongoDB connected");
}
export function getDB() {
  if (!db) throw new Error("Database not connected");
  return db;
}
