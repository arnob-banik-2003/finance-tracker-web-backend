const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// const uri = "mongodb+srv://<db_username>:<db_password>@cluster1.fc0jkus.mongodb.net/?appName=Cluster1";
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.fc0jkus.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // --------------------=--------------------
    //      Database Collection List
    //---------------------=-------------------
    const usersCollection = client
      .db("financeTracker_DB")
      .collection("usersDB");
    const booksCollection = client
      .db("financeTracker_DB")
      .collection("booksDB");
    const transactionsCollection = client
      .db("financeTracker_DB")
      .collection("transactionsDB");
    const categoriesCollection = client
      .db("financeTracker_DB")
      .collection("categoriesDB");
      
    // --------------------=--------------------
    //      Users Database with API
    //---------------------=-------------------

    app.get("/users", async (req, res) => {
      try {
        const email = req.query.email;
        let query = {};

        if (email) {
          query = { email: email };
          const user = await usersCollection.findOne(query);

          if (!user) {
            return res.status(404).send({ message: "User not found" });
          }

          return res.send(user);
        }

        // if no email parameter get all users
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch users data" });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };

        // check existing user
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "User already exists", insertedId: null });
        }

        // new user inserted from here
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to insert User data" });
      }
    });

    // Get Logged-in User Profile
    app.get("/users/profile", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ error: "Email is required" });

        const user = await usersCollection.findOne({ email: email.trim() });
        if (!user) return res.status(404).send({ message: "User not found" });

        res.send(user);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch user profile" });
      }
    });

    // Update User Profile (Phone, Location, FullName)
    // app.patch("/users/profile", async (req, res) => {
    //   try {
    //     const { email, fullName, phone, location } = req.body;
    //     if (!email) return res.status(400).send({ error: "Email is required" });

    //     const filter = { email: email.trim() };
    //     const updateDoc = {
    //       $set: {
    //         ...(fullName && { fullName }),
    //         ...(phone && { phone }),
    //         ...(location && { location }),
    //         updatedAt: new Date(),
    //       },
    //     };

    //     const result = await usersCollection.updateOne(filter, updateDoc);
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ error: "Failed to update profile" });
    //   }
    // });

    // Delete All User Data (Transactions, Budgets, Books, Debts, Categories)
    app.delete("/users/data", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).send({ error: "Email is required" });

        const userEmail = email.trim();

        // Delete user specific documents across all collections
        await transactionsCollection.deleteMany({ userEmail });
        await budgetsCollection.deleteMany({ userEmail });
        await booksCollection.deleteMany({ "createdBy.email": userEmail });
        await debtsCollection.deleteMany({ userEmail });
        await categoriesCollection.deleteMany({
          userEmail,
          isDefault: { $ne: true },
        });

        res.send({
          success: true,
          message: "All user data deleted successfully",
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to delete user data" });
      }
    });

    // --------------------=--------------------
    //      Books Database with API
    //---------------------=-------------------

    // get all books / query by email books
    app.get("/books", async (req, res) => {
      try {
        const email = req.query.email;
        let query = {};

        if (email) {
          query = { "createdBy.email": email.trim() };
        }
        const result = await booksCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch books" });
      }
    });

    // get books using id
    app.get("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const bookData = await booksCollection.findOne(query);

        if (!bookData) {
          return res.status(404).send({ message: "Book not found" });
        }
        res.send(bookData);
      } catch (error) {
        return res.status(500).send("Failed to fetch books");
      }
    });

    // create books api
    app.post("/books", async (req, res) => {
      try {
        const bookData = req.body;

        const openingBalanceNum = parseFloat(bookData.openingBalance || 0);

        // Prepare Book document with updated totals
        const newBook = {
          ...bookData,
          openingBalance: openingBalanceNum,
          currentBalance: openingBalanceNum,
          totalIncome: openingBalanceNum, // Opening Balance counts as initial income
          totalExpense: 0,
          createdAt: bookData.createdAt || new Date().toISOString(),
        };
        // Insert Book into Books Collection
        const result = await booksCollection.insertOne(newBook);
        const bookId = result.insertedId;

        // If Opening Balance is greater than 0, create an initial transaction entry
        if (openingBalanceNum > 0) {
          const initialTransaction = {
            bookId: bookId.toString(),
            amount: openingBalanceNum,
            type: "CASH_IN",
            title: "Opening Balance",
            note: "Initial book balance",
            category: "General", // Default Category
            date: newBook.createdAt,
            createdAt: newBook.createdAt,
            userEmail: bookData.createdBy?.email || "",
            isOpeningBalance: true, // Marker flag for future filtering/identification if needed
          };

          await transactionsCollection.insertOne(initialTransaction);
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to insert book data" });
      }
    });

    // book update api
    app.patch("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        const updateDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          },
        };
        const result = await booksCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update book" });
      }
    });

    // book delete api
    app.delete("/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);

        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to delete books");
      }
    });

    // --------------------=--------------------
    //      Transactions Database with API
    //---------------------=-------------------

    app.post("/transactions", async (req, res) => {
      try {
        const transactionData = req.body;

        // Handle Transfer between two books
        if (transactionData.type === "TRANSFER") {
          const { sourceBookId, destinationBookId } =
            transactionData.transferDetails || {};

          if (!sourceBookId || !destinationBookId) {
            return res
              .status(400)
              .send({ error: "Source and Destination books are required" });
          }

          const amount = parseFloat(transactionData.amount);
          const transferPairId =
            transactionData.transferDetails.transferPairId ||
            `TP-${Date.now()}`;

          // Debit record for source book (OUT)
          const sourceTransaction = {
            ...transactionData,
            bookId: sourceBookId,
            type: "TRANSFER",
            transferType: "OUT",
            transferDetails: {
              transferPairId,
              sourceBookId,
              destinationBookId,
            },
          };

          // Credit record for destination book (IN)
          const destinationTransaction = {
            ...transactionData,
            bookId: destinationBookId,
            type: "TRANSFER",
            transferType: "IN",
            transferDetails: {
              transferPairId,
              sourceBookId,
              destinationBookId,
            },
          };

          // Store both transaction entries in database
          const result = await transactionsCollection.insertMany([
            sourceTransaction,
            destinationTransaction,
          ]);

          // Deduct balance and INCREASE totalExpense for Source Book
          await booksCollection.updateOne(
            { _id: new ObjectId(sourceBookId) },
            {
              $inc: {
                currentBalance: -amount,
                totalIncome: -amount,
                // totalExpense: amount, // <-- Added totalExpense update
              },
            },
          );

          // Add balance and INCREASE totalIncome for Destination Book
          await booksCollection.updateOne(
            { _id: new ObjectId(destinationBookId) },
            {
              $inc: {
                currentBalance: amount,
                totalIncome: amount, // <-- Added totalIncome update
              },
            },
          );

          return res.send({
            acknowledged: true,
            insertedId: result.insertedIds[0],
            insertedCount: result.insertedCount,
          });
        }

        // Handle Standard Income/Expense Transactions (CASH_IN / CASH_OUT)
        const result = await transactionsCollection.insertOne(transactionData);

        if (result.insertedId) {
          const amount = parseFloat(transactionData.amount);

          if (transactionData.type === "CASH_IN") {
            await booksCollection.updateOne(
              { _id: new ObjectId(transactionData.bookId) },
              { $inc: { currentBalance: amount, totalIncome: amount } },
            );
          } else if (transactionData.type === "CASH_OUT") {
            await booksCollection.updateOne(
              { _id: new ObjectId(transactionData.bookId) },
              { $inc: { currentBalance: -amount, totalExpense: amount } },
            );
          }
        }

        res.send(result);
      } catch (error) {
        console.error("Transaction Creation Error:", error);
        res.status(500).send({ error: "Failed to insert transaction" });
      }
    });

    app.get("/transactions", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ error: "Email is required" });

        const transactions = await transactionsCollection
          .aggregate([
            { $match: { userEmail: email } },

            // 1. Convert string bookId to ObjectId safely
            {
              $addFields: {
                convertedBookId: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$bookId", null] },
                        { $ne: ["$bookId", ""] },
                        { $eq: [{ $strLenCP: { $toString: "$bookId" } }, 24] },
                      ],
                    },
                    { $toObjectId: "$bookId" },
                    null,
                  ],
                },
              },
            },

            // 2. Lookup from books collection
            {
              $lookup: {
                from: "booksDB",
                localField: "convertedBookId",
                foreignField: "_id",
                as: "bookDetails",
              },
            },
            {
              $unwind: {
                path: "$bookDetails",
                preserveNullAndEmptyArrays: true,
              },
            },

            // 3. Add bookName & bookIcon fields
            {
              $addFields: {
                bookName: {
                  $ifNull: ["$bookDetails.bookName", "Unknown Book"],
                },
                bookIcon: { $ifNull: ["$bookDetails.icon", "wallet"] },
                bookColor: { $ifNull: ["$bookDetails.themeColor", "#2E6F40"] },
              },
            },

            // 4. Clean up temporary fields
            {
              $project: {
                bookDetails: 0,
                convertedBookId: 0,
              },
            },
            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        res.send(transactions);
      } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).send({ error: "Failed to fetch transactions" });
      }
    });

    // --------------------=--------------------
    //      Categories Database with API
    //---------------------=-------------------
    app.post("/categories", async (req, res) => {
      try {
        const categoriesData = req.body;
        const result = await categoriesCollection.insertOne(categoriesData);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to insert book data" });
      }
    });

    app.get("/categories", async (req, res) => {
      try {
        const email = req.query.email;
        let query = { isDefault: true };

        if (email) {
          query = {
            $or: [{ isDefault: true }, { userEmail: email }],
          };
        }
        const result = await categoriesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch books" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
