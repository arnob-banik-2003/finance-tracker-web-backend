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
    const remindersCollection = client
      .db("financeTracker_DB")
      .collection("remindersDB");
    const budgetsCollection = client
      .db("financeTracker_DB")
      .collection("budgetsDB");
    const debtsCollection = client
      .db("financeTracker_DB")
      .collection("debtsDB");

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

    // --------------------=--------------------
    //      Reminder Database with API
    //---------------------=-------------------

    // 1. Get all reminders for a specific user
    app.get("/reminders", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res
            .status(400)
            .send({ error: "Email query parameter is required" });
        }

        const query = { userEmail: email.trim() };
        const result = await remindersCollection
          .find(query)
          .sort({ nextDueDate: 1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Fetch Reminders Error:", error);
        res.status(500).send({ error: "Failed to fetch reminders" });
      }
    });

    // 2. Get single reminder details by ID
    app.get("/reminders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const reminder = await remindersCollection.findOne(query);

        if (!reminder) {
          return res.status(404).send({ message: "Reminder not found" });
        }

        res.send(reminder);
      } catch (error) {
        console.error("Fetch Single Reminder Error:", error);
        res.status(500).send({ error: "Failed to fetch reminder" });
      }
    });

    // 3. Create a new recurring reminder
    app.post("/reminders", async (req, res) => {
      try {
        const reminderData = req.body;

        const newReminder = {
          ...reminderData,
          amount: parseFloat(reminderData.amount),
          status: reminderData.status || "active",
          createdAt: new Date(),
        };

        const result = await remindersCollection.insertOne(newReminder);
        res.send(result);
      } catch (error) {
        console.error("Create Reminder Error:", error);
        res.status(500).send({ error: "Failed to create reminder" });
      }
    });

    // 4. Process Payment for a Reminder (Creates Transaction, Updates Book Balance & Calculates Next Due Date)
    app.post("/reminders/:id/process", async (req, res) => {
      const session = client.startSession();
      try {
        session.startTransaction();
        const id = req.params.id;
        const { email } = req.body;

        // 1. Reminder Information
        const reminder = await remindersCollection.findOne(
          { _id: new ObjectId(id) },
          { session },
        );

        if (!reminder) {
          await session.abortTransaction();
          return res.status(404).send({ error: "Reminder not found" });
        }

        // 2. Reminder Status "paid"
        await remindersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "paid", updatedAt: new Date() } },
          { session },
        );

        //
        const transactionType =
          reminder.type === "EXPENSE" ? "CASH_OUT" : "CASH_IN";

        // 4. Make New Transaction
        const newTransaction = {
          userId: reminder.userId || null,
          userEmail: email || reminder.userEmail,
          type: transactionType,
          categoryId: reminder.category || null,
          amount: parseFloat(reminder.amount),
          date: new Date(),
          note: `Paid for reminder: ${reminder.title}`,
          bookId: reminder.bookId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await transactionsCollection.insertOne(newTransaction, { session });

        // 5. Update Book Balance and Expense/Income
        const amount = parseFloat(reminder.amount);
        const balanceUpdate =
          transactionType === "CASH_IN"
            ? { currentBalance: amount, totalIncome: amount }
            : { currentBalance: -amount, totalExpense: amount };

        await booksCollection.updateOne(
          { _id: new ObjectId(reminder.bookId) },
          { $inc: balanceUpdate },
          { session },
        );

        await session.commitTransaction();
        res.send({
          success: true,
          message: "Reminder paid and transaction recorded successfully",
        });
      } catch (error) {
        await session.abortTransaction();
        console.error("Process Payment Error:", error);
        res.status(500).send({ error: "Failed to process payment" });
      } finally {
        session.endSession();
      }
    });

    // 5. Update reminder details
    app.patch("/reminders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedData = req.body;

        if (updatedData.amount) {
          updatedData.amount = parseFloat(updatedData.amount);
        }

        const updateDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          },
        };

        const result = await remindersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Update Reminder Error:", error);
        res.status(500).send({ error: "Failed to update reminder" });
      }
    });

    // Delete reminder
    app.delete("/reminders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await remindersCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Reminder not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Delete Reminder Error:", error);
        res.status(500).send({ error: "Failed to delete reminder" });
      }
    });

    // --------------------=--------------------
    //      Budget Database with API
    //---------------------=-------------------

    app.post("/budgets", async (req, res) => {
      try {
        const budgetData = req.body;

        const result = await budgetsCollection.insertOne(budgetData);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to insert budget data" });
      }
    });
    //  2. Get Budgets (filter by userEmail, bookId, category, month)
    app.get("/budgets", async (req, res) => {
      try {
        const { email, bookId, category, month } = req.query;
        let query = {};

        if (email) {
          query.userEmail = email.trim();
        }
        if (bookId) {
          query.bookId = bookId;
        }
        if (category) {
          query.category = category;
        }
        if (month) {
          query.month = month; // Format example: "2026-03"
        }

        const result = await budgetsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch budgets" });
      }
    });

    app.get("/budgets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const budget = await budgetsCollection.findOne(query);

        if (!budget) {
          return res.status(404).send({ message: "Budget not found" });
        }
        res.send(budget);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch budget" });
      }
    });

    // 4. Update Budget by ID
    app.patch("/budgets/:id", async (req, res) => {
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

        const result = await budgetsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update budget" });
      }
    });

    // 5. Delete Budget by ID
    app.delete("/budgets/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await budgetsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Budget not found" });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete budget" });
      }
    });

    // --------------------=--------------------
    //      Lent and Borrowed Database with API
    // --------------------=--------------------
    app.post("/debts", async (req, res) => {
      try {
        const debtData = req.body;

        const result = await debtsCollection.insertOne(debtData);

        res.send(result);
      } catch (error) {
        console.error("Create Debt Error:", error);
        res.status(500).send({ error: "Failed to create debt record" });
      }
    });

    app.get("/debts", async (req, res) => {
      try {
        const { email, userId, type, status, bookId } = req.query;
        let query = {};

        if (email) query.userEmail = email.trim();
        if (userId) query.userId = userId;
        if (type) query.type = type;
        if (status) query.status = status;
        if (bookId) query.bookId = bookId;

        const result = await debtsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch debt records" });
      }
    });

    app.patch("/debts/settle/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { amount, note } = req.body;
        const filter = { _id: new ObjectId(id) };

        const debt = await debtsCollection.findOne(filter);
        if (!debt) {
          return res.status(404).send({ error: "Debt record not found" });
        }

        const currentBalance = Number(debt.remainingBalance) || 0;
        const paymentAmount = Number(amount) || currentBalance;
        const newRemainingBalance = Math.max(0, currentBalance - paymentAmount);

        // Status update: balance 0 hole 'PAID', na hole 'PARTIAL'
        const newStatus = newRemainingBalance === 0 ? "PAID" : "PARTIAL";

        const updateDoc = {
          $set: {
            remainingBalance: newRemainingBalance,
            status: newStatus,
            updatedAt: new Date(),
          },
          $push: {
            settlements: {
              amount: paymentAmount,
              note: note || "Settlement Payment",
              date: new Date(),
            },
          },
        };

        const result = await debtsCollection.updateOne(filter, updateDoc);
        res.send({
          success: true,
          result,
          remainingBalance: newRemainingBalance,
          status: newStatus,
        });
      } catch (error) {
        console.error("Settle Debt Error:", error);
        res.status(500).send({ error: "Failed to settle debt record" });
      }
    });

    // =----------------------------------------
    // DASHBOARD SUMMARY API
    // =----------------------------------------
    app.get("/dashboard/summary", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res
            .status(400)
            .send({ error: "Email query parameter is required" });
        const userEmail = email.trim();

        // Calculate Net Balance across all user books
        const books = await booksCollection
          .find({ "createdBy.email": userEmail })
          .toArray();
        const totalNetBalance = books.reduce(
          (sum, book) => sum + (parseFloat(book.currentBalance) || 0),
          0,
        );

        // Aggregate income and expense stats
        const transactionStats = await transactionsCollection
          .aggregate([
            { $match: { userEmail: userEmail } },
            {
              $group: {
                _id: "$type",
                totalAmount: { $sum: { $toDouble: "$amount" } },
              },
            },
          ])
          .toArray();

        let totalExpense = 0;
        let totalIncome = 0;

        transactionStats.forEach((stat) => {
          if (stat._id === "CASH_OUT") totalExpense = stat.totalAmount;
          if (stat._id === "CASH_IN") totalIncome = stat.totalAmount;
        });

        const netSavings = totalIncome - totalExpense;

        // Calculate Total Lent & Borrowed from debtsCollection
        const debts = await debtsCollection
          .find({ userEmail: userEmail })
          .toArray();

        let totalLent = 0;
        let totalBorrowed = 0;

        debts.forEach((debt) => {
          const remainingAmount =
            parseFloat(debt.remainingBalance) || parseFloat(debt.amount) || 0;
          if (debt.type === "LENT") {
            totalLent += remainingAmount;
          } else if (debt.type === "BORROWED") {
            totalBorrowed += remainingAmount;
          }
        });

        // Categorized expenses
        // const categoryExpenses = await transactionsCollection
        //   .aggregate([
        //     {
        //       $match: {
        //         userEmail: userEmail,
        //         type: "CASH_OUT",
        //         categoryId: { $ne: null, $exists: true },
        //       },
        //     },
        //     {
        //       $addFields: {
        //         convertedCategoryId: { $toObjectId: "$categoryId" },
        //       },
        //     },
        //     {
        //       $lookup: {
        //         from: "categoriesDB",
        //         localField: "convertedCategoryId",
        //         foreignField: "_id",
        //         as: "categoryDetails",
        //       },
        //     },
        //     { $unwind: "$categoryDetails" },
        //     {
        //       $group: {
        //         _id: "$categoryDetails.name",
        //         amount: { $sum: { $toDouble: "$amount" } },
        //         color: { $first: "$categoryDetails.color" },
        //       },
        //     },
        //     {
        //       $project: {
        //         name: "$_id",
        //         category: "$_id",
        //         amount: 1,
        //         color: 1,
        //         _id: 0,
        //       },
        //     },
        //   ])
        //   .toArray();

        const categoryExpenses = await transactionsCollection
          .aggregate([
            {
              $match: {
                userEmail: userEmail,
                type: "CASH_OUT",
              },
            },
            {
              $addFields: {
                convertedCategoryId: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$categoryId", null] },
                        { $ne: ["$categoryId", ""] },
                        {
                          $eq: [
                            { $strLenCP: { $toString: "$categoryId" } },
                            24,
                          ],
                        },
                      ],
                    },
                    { $toObjectId: "$categoryId" },
                    null,
                  ],
                },
                rawCategoryName: {
                  $ifNull: [
                    "$category",
                    {
                      $cond: [
                        {
                          $eq: [
                            { $strLenCP: { $toString: "$categoryId" } },
                            24,
                          ],
                        },
                        null,
                        "$categoryId",
                      ],
                    },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "categoriesDB",
                localField: "convertedCategoryId",
                foreignField: "_id",
                as: "categoryDetails",
              },
            },
            {
              $unwind: {
                path: "$categoryDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                finalCategoryName: {
                  $ifNull: [
                    "$categoryDetails.name",
                    { $ifNull: ["$rawCategoryName", "General"] },
                  ],
                },
                // 1. First preference: categoryDetails.color (DB lookup)
                // 2. Second preference: transaction payload - color
                // 3. Fallback: Dynamic color generation based on category name
                finalCategoryColor: {
                  $ifNull: [
                    "$categoryDetails.color",
                    {
                      $ifNull: [
                        "$color",
                        "#3B82F6", // Vibrant default instead of dull gray
                      ],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: "$finalCategoryName",
                amount: { $sum: { $toDouble: "$amount" } },
                color: { $first: "$finalCategoryColor" },
              },
            },
            {
              $project: {
                _id: 0,
                name: "$_id",
                category: "$_id",
                amount: 1,
                color: 1,
              },
            },
          ])
          .toArray();

        // Total budgeted calculation
        const budgets = await budgetsCollection
          .find({ userEmail: userEmail })
          .toArray();
        const totalBudgeted = budgets.reduce(
          (sum, b) => sum + (parseFloat(b.budgetAmount) || 0),
          0,
        );

        res.send({
          metrics: {
            totalNetBalance,
            totalBudgeted,
            totalExpense,
            netSavings,
            totalLent,
            totalBorrowed,
          },
          categoryExpenses,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to load dashboard summary" });
      }
    });

    // =----------------------------------------
    // BUDGET VS EXPENSE OVERVIEW API (Optimized Aggregation)
    // =----------------------------------------

    app.get("/dashboard/budget-overview", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ error: "Email is required" });
        const userEmail = email.trim();

        const budgetOverview = await budgetsCollection
          .aggregate([
            { $match: { userEmail } },

            // 1. Convert string bookId to ObjectId safely
            {
              $addFields: {
                convertedBookId: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$bookId", null] },
                        { $ne: ["$bookId", ""] },
                        { $eq: [{ $strLenCP: { $toString: "$bookId" } }, 24] }, // Valid ObjectId check
                      ],
                    },
                    { $toObjectId: "$bookId" },
                    null,
                  ],
                },
              },
            },

            // 2. Lookup Book Details (Make sure collection name is correct)
            {
              $lookup: {
                from: "booksDB", // MongoDB-তে আসল collection name টি লিখুন (eg. books or booksDB)
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

            // 3. Lookup Transactions for Category Spending
            {
              $lookup: {
                from: "transactionsDB",
                let: { catName: "$category", userEmail: "$userEmail" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$userEmail", "$$userEmail"] },
                          { $eq: ["$type", "CASH_OUT"] },
                        ],
                      },
                    },
                  },
                  {
                    $addFields: {
                      convertedCategoryId: {
                        $cond: [
                          {
                            $and: [
                              { $ne: ["$categoryId", null] },
                              { $ne: ["$categoryId", ""] },
                              {
                                $eq: [
                                  { $strLenCP: { $toString: "$categoryId" } },
                                  24,
                                ],
                              },
                            ],
                          },
                          { $toObjectId: "$categoryId" },
                          null,
                        ],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: "categoriesDB",
                      localField: "convertedCategoryId",
                      foreignField: "_id",
                      as: "cat",
                    },
                  },
                  { $unwind: "$cat" },
                  {
                    $match: {
                      $expr: { $eq: ["$cat.name", "$$catName"] },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalSpent: { $sum: { $toDouble: "$amount" } },
                    },
                  },
                ],
                as: "spentData",
              },
            },

            // 4. Final Projection
            {
              $project: {
                _id: 1,
                name: "$category",
                spent: {
                  $ifNull: [{ $arrayElemAt: ["$spentData.totalSpent", 0] }, 0],
                },
                total: { $toDouble: { $ifNull: ["$budgetAmount", 0] } },
                bookId: { $ifNull: ["$bookId", null] },
                bookName: { $ifNull: ["$bookDetails.bookName", "N/A"] },
              },
            },
          ])
          .toArray();

        res.send(budgetOverview);
      } catch (error) {
        console.error("Budget Overview Error:", error);
        res.status(500).send({ error: "Failed to calculate budget overview" });
      }
    });

    // --------------------=--------------------
    //      Reports Database with API
    // --------------------=--------------------

    app.get("/reports/analytics", async (req, res) => {
      try {
        const {
          email,
          period = "Monthly",
          selectedBook = "combined",
        } = req.query;

        if (!email) {
          return res.status(400).send({ error: "Email is required" });
        }

        const userEmail = email.trim();
        const currentDate = new Date();
        let startDate = new Date();

        if (period === "Daily") {
          startDate.setHours(0, 0, 0, 0);
        } else if (period === "Weekly") {
          startDate.setDate(currentDate.getDate() - 7);
        } else if (period === "Monthly") {
          startDate.setMonth(currentDate.getMonth() - 1);
        } else if (period === "Yearly") {
          startDate.setFullYear(currentDate.getFullYear() - 1);
        }

        // 1. Transaction Match Query
        const matchQuery = {
          userEmail,
          date: { $gte: startDate.toISOString() },
        };

        if (
          selectedBook &&
          selectedBook !== "combined" &&
          selectedBook !== "all"
        ) {
          matchQuery.bookId = selectedBook;
        }

        // Calculate Total Income & Expense
        const stats = await transactionsCollection
          .aggregate([
            { $match: matchQuery },
            {
              $group: {
                _id: "$type",
                total: { $sum: { $toDouble: "$amount" } },
              },
            },
          ])
          .toArray();

        let totalIncome = 0;
        let totalExpense = 0;

        stats.forEach((item) => {
          if (item._id === "CASH_IN") totalIncome = item.total;
          if (item._id === "CASH_OUT") totalExpense = item.total;
        });

        // 2. Fetch User Books
        const userBooks = await booksCollection
          .find({ "createdBy.email": userEmail })
          .toArray();

        let targetedBooks = userBooks;
        if (
          selectedBook &&
          selectedBook !== "combined" &&
          selectedBook !== "all" &&
          selectedBook.length === 24
        ) {
          targetedBooks = userBooks.filter(
            (b) => b._id.toString() === selectedBook,
          );
        }

        const currentBalance = targetedBooks.reduce(
          (sum, book) => sum + (parseFloat(book.currentBalance) || 0),
          0,
        );

        // 3. Balance Trend aggregate query
        const balanceTrend = await transactionsCollection
          .aggregate([
            { $match: matchQuery },
            {
              $group: {
                _id: { $substr: ["$date", 0, 10] },
                totalIncome: {
                  $sum: {
                    $cond: [
                      { $eq: ["$type", "CASH_IN"] },
                      { $toDouble: "$amount" },
                      0,
                    ],
                  },
                },
                totalExpense: {
                  $sum: {
                    $cond: [
                      { $eq: ["$type", "CASH_OUT"] },
                      { $toDouble: "$amount" },
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                time: "$_id",
                balance: { $subtract: ["$totalIncome", "$totalExpense"] },
              },
            },
          ])
          .toArray();

        // 4. Categorized Expenses Aggregate Query
        const categoryExpensesMatch = {
          userEmail,
          type: "CASH_OUT",
          date: { $gte: startDate.toISOString() },
        };

        if (
          selectedBook &&
          selectedBook !== "combined" &&
          selectedBook !== "all"
        ) {
          categoryExpensesMatch.bookId = selectedBook;
        }

        const categories = await transactionsCollection
          .aggregate([
            { $match: categoryExpensesMatch },
            {
              $addFields: {
                convertedCategoryId: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$categoryId", null] },
                        { $ne: ["$categoryId", ""] },
                        {
                          $eq: [
                            { $strLenCP: { $toString: "$categoryId" } },
                            24,
                          ],
                        },
                      ],
                    },
                    { $toObjectId: "$categoryId" },
                    null,
                  ],
                },
                rawCategoryName: {
                  $ifNull: ["$category", "$categoryName"],
                },
              },
            },
            {
              $lookup: {
                from: "categoriesDB",
                localField: "convertedCategoryId",
                foreignField: "_id",
                as: "cat",
              },
            },
            {
              $unwind: {
                path: "$cat",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                finalCategoryName: {
                  $ifNull: [
                    "$cat.name",
                    { $ifNull: ["$rawCategoryName", "General"] },
                  ],
                },
                finalColor: {
                  $ifNull: ["$cat.color", { $ifNull: ["$color", "#10B981"] }],
                },
              },
            },
            {
              $group: {
                _id: "$finalCategoryName",
                value: { $sum: { $toDouble: "$amount" } },
                color: { $first: "$finalColor" },
              },
            },
            {
              $project: {
                _id: 0,
                name: "$_id",
                category: "$_id",
                value: 1,
                color: 1,
              },
            },
          ])
          .toArray();

        res.send({
          totalIncome,
          totalExpense,
          currentBalance,
          incomeGrowth: "+0%",
          expenseGrowth: "-0%",
          balanceTrend,
          categories,
          userBooks,
        });
      } catch (error) {
        console.error("Reports API Error:", error);
        res.status(500).send({ error: "Failed to fetch report analytics" });
      }
    });

    // 2. Get Overall Lifetime Metrics
    // app.get("/reports/overall", async (req, res) => {
    //   try {
    //     const { email } = req.query;

    //     if (!email) {
    //       return res.status(400).send({ error: "Email is required" });
    //     }

    //     const userEmail = email.trim();

    //     const overallStats = await transactionsCollection
    //       .aggregate([
    //         { $match: { userEmail } },
    //         {
    //           $group: {
    //             _id: "$type",
    //             totalAmount: { $sum: { $toDouble: "$amount" } },
    //             totalCount: { $sum: 1 },
    //           },
    //         },
    //       ])
    //       .toArray();

    //     res.send(overallStats);
    //   } catch (error) {
    //     res.status(500).send({ error: "Failed to fetch overall analytics" });
    //   }
    // });

    // --------------------=--------------------
    //    Backup Database with API
    //---------------------=-------------------

    // ALL-IN-ONE BACKUP API (FETCH ALL USER DATA)
    app.get("/backup/all", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).send({ error: "Email parameter is required" });
        }

        const userEmail = email.trim();

        // Fetch user specific data across all collections
        const books = await booksCollection
          .find({ "createdBy.email": userEmail })
          .toArray();
        const budgets = await budgetsCollection.find({ userEmail }).toArray();
        const debts = await debtsCollection.find({ userEmail }).toArray();
        const transactions = await transactionsCollection
          .find({ userEmail })
          .toArray();
        const categories = await categoriesCollection
          .find({ userEmail })
          .toArray();
        const profile = await usersCollection.findOne({ email: userEmail });

        // Package everything into a single Object
        const backupPayload = {
          userEmail,
          backupDate: new Date(),
          data: {
            books,
            budgets,
            debts,
            transactions,
            categories,
            profile,
          },
        };

        res.send(backupPayload);
      } catch (error) {
        console.error("Backup All Data Error:", error);
        res
          .status(500)
          .send({ error: "Failed to generate full system backup" });
      }
    });

    // ALL-IN-ONE RESTORE API (INSERT ALL USER DATA)
    app.post("/backup/restore-all", async (req, res) => {
      try {
        const { email, backupData } = req.body;

        if (!email || !backupData || !backupData.data) {
          return res
            .status(400)
            .send({ error: "Invalid backup dataset provided" });
        }

        const userEmail = email.trim();
        const { books, budgets, debts, transactions, categories } =
          backupData.data;

        // Helper function to remove old MongoDB _id
        const stripId = (items) => {
          if (!Array.isArray(items)) return [];
          return items.map((item) => {
            const { _id, ...rest } = item;
            return { ...rest, restoredAt: new Date() };
          });
        };

        // 1. CLEANUP existing records for this user
        await transactionsCollection.deleteMany({ userEmail });
        await budgetsCollection.deleteMany({ userEmail });
        await debtsCollection.deleteMany({ userEmail });
        await booksCollection.deleteMany({ "createdBy.email": userEmail });
        await categoriesCollection.deleteMany({ userEmail });

        // 2. INSERT Restored Collections
        const cleanBooks = stripId(books);
        const cleanBudgets = stripId(budgets);
        const cleanDebts = stripId(debts);
        const cleanTransactions = stripId(transactions);
        const cleanCategories = stripId(categories);

        if (cleanBooks.length > 0) await booksCollection.insertMany(cleanBooks);
        if (cleanBudgets.length > 0)
          await budgetsCollection.insertMany(cleanBudgets);
        if (cleanDebts.length > 0) await debtsCollection.insertMany(cleanDebts);
        if (cleanTransactions.length > 0)
          await transactionsCollection.insertMany(cleanTransactions);
        if (cleanCategories.length > 0)
          await categoriesCollection.insertMany(cleanCategories);

        res.send({
          success: true,
          message:
            "All data (Books, Budgets, Debts, Transactions, Categories) restored successfully!",
        });
      } catch (error) {
        console.error("Full System Restore Error:", error);
        res
          .status(500)
          .send({ error: "Failed to perform full system restore" });
      }
    });

    // --------------------=--------------------
    //    Export Database with API
    //---------------------=-------------------

    // Export All User Data Route (Includes all collections)
    app.get("/export/all-data", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const userEmail = email.trim();

        // 1. Fetch all transactions for the user
        const transactions = await transactionsCollection
          .find({ userEmail })
          .sort({ date: -1 })
          .toArray();

        // 2. Fetch all books/ledgers associated with the user
        const books = await booksCollection
          .find({
            $or: [{ "createdBy.email": userEmail }, { userEmail: userEmail }],
          })
          .toArray();

        // 3. Fetch default categories as well as user-created custom categories
        const categories = await categoriesCollection
          .find({
            $or: [{ isDefault: true }, { userEmail: userEmail }],
          })
          .toArray();

        // 4. Fetch user budget limits
        const budgets = await budgetsCollection.find({ userEmail }).toArray();

        // 5. Fetch debt records (Lent & Borrowed)
        const debts = await debtsCollection
          .find({ userEmail })
          .sort({ createdAt: -1 })
          .toArray();

        // 6. Fetch recurring bill reminders
        const reminders = await remindersCollection
          .find({ userEmail })
          .toArray();

        // 7. Fetch user profile info (Excluding sensitive data if any)
        const profile = await usersCollection.findOne(
          { email: userEmail },
          { projection: { password: 0 } },
        );

        res.send({
          transactions,
          books,
          categories,
          budgets,
          debts,
          reminders,
          profile: profile || {},
        });
      } catch (error) {
        console.error("Export Error:", error);
        res.status(500).send({ message: "Failed to fetch export data" });
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
