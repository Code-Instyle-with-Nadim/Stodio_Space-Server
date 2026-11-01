import "dotenv/config";
import { MongoClient } from "mongodb";
import studios from "../data/studios.json" with { type: "json" };
const client = new MongoClient(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
);
async function run() {
  await client.connect();
  const db = client.db(process.env.DB_NAME || "studiospace");
  await db
    .collection("studios")
    .deleteMany({ hostEmail: "seed@studiospace.demo" });
  await db
    .collection("studios")
    .insertMany(
      studios.map((s) => ({
        ...s,
        hostEmail: "seed@studiospace.demo",
        createdAt: new Date(),
      })),
    );
  console.log(`Seeded ${studios.length} studios`);
  await client.close();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
