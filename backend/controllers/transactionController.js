const axios = require('axios');
const Transaction = require('../models/Transaction');

// Fetch data and initialize the database
exports.initializeDatabase = async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const data = response.data;
        await Transaction.insertMany(data);
        res.status(201).send('Database initialized successfully');
    } catch (error) {
        res.status(500).send('Error initializing database: ' + error.message);
    }
};

// List all transactions with search and pagination
exports.listTransactions = async (req, res) => {
    const { page = 1, perPage = 10, search = '', month } = req.query;

    // Validate the month
    const validMonths = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    
    if (!validMonths.includes(month)) {
        return res.status(400).send('Invalid month');
    }

    // Get the month index (0 for January, 1 for February, etc.)
    const monthIndex = validMonths.indexOf(month);

    console.log(`Querying transactions for month: ${month} (index: ${monthIndex})`);

    // Construct the aggregation pipeline
    const pipeline = [
        {
            $addFields: {
                month: { $month: "$dateOfSale" },
                day: { $dayOfMonth: "$dateOfSale" }
            }
        },
        {
            $match: {
                month: monthIndex + 1
            }
        }
    ];

    // If search query is provided, add search conditions
    if (search) {
        const searchNumber = Number(search);
        const searchConditions = [
            { title: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') }
        ];
        if (!isNaN(searchNumber)) {
            searchConditions.push({ price: searchNumber });
        }
        pipeline.push({
            $match: {
                $or: searchConditions
            }
        });
    }

    // Skip and limit for pagination
    pipeline.push(
        { $skip: (page - 1) * perPage },
        { $limit: parseInt(perPage) }
    );

    console.log('Constructed pipeline:', JSON.stringify(pipeline, null, 2));

    try {
        const transactions = await Transaction.aggregate(pipeline);

        console.log('Found transactions:', transactions.length);

        res.status(200).json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).send('Error fetching transactions: ' + error.message);
    }
};

// Helper function to get month number from month name
const getMonthNumber = (month) => {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthNumber = monthNames.indexOf(month) + 1;
    if (monthNumber < 1) {
        throw new Error('Invalid month');
    }
    return monthNumber;
};

// Function to get statistics data
const getStatisticsData = async (month) => {
    const monthNumber = getMonthNumber(month);

    try {
        const totalSale = await Transaction.aggregate([
            {
                $addFields: {
                    month: { $month: "$dateOfSale" }
                }
            },
            {
                $match: { month: monthNumber, sold: true }
            },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        const soldItems = await Transaction.countDocuments({
            $expr: { $eq: [{ $month: "$dateOfSale" }, monthNumber] },
            sold: true
        });

        const notSoldItems = await Transaction.countDocuments({
            $expr: { $eq: [{ $month: "$dateOfSale" }, monthNumber] },
            sold: false
        });

        return {
            totalSale: totalSale.length > 0 ? totalSale[0].total : 0,
            totalSoldItems: soldItems,
            totalNotSoldItems: notSoldItems
        };
    } catch (error) {
        throw new Error('Error fetching statistics data: ' + error.message);
    }
};


// Function to get bar chart data
const getBarChartData = async (month) => {
    const monthNumber = getMonthNumber(month);

    const barChart = await Transaction.aggregate([
        {
            $addFields: {
                month: { $month: "$dateOfSale" }
            }
        },
        {
            $match: { month: monthNumber }
        },
        {
            $bucket: {
                groupBy: "$price",
                boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
                default: "Other",
                output: {
                    count: { $sum: 1 }
                }
            }
        }
    ]);

    return barChart;
};

// Function to get pie chart data
const getPieChartData = async (month) => {
    const monthNumber = getMonthNumber(month);

    const pieChart = await Transaction.aggregate([
        {
            $addFields: {
                month: { $month: "$dateOfSale" }
            }
        },
        {
            $match: { month: monthNumber }
        },
        {
            $group: {
                _id: "$category",
                count: { $sum: 1 }
            }
        }
    ]);

    return pieChart;
};

// Function to get statistics
exports.getStatistics = async (req, res) => {
    const { month } = req.query;
    try {
        const statistics = await getStatisticsData(month);
        res.status(200).json(statistics);
    } catch (error) {
        res.status(500).send('Error fetching statistics: ' + error.message);
    }
};

// Function to get bar chart data
exports.getBarChart = async (req, res) => {
    const { month } = req.query;
    try {
        const barChart = await getBarChartData(month);
        res.status(200).json(barChart);
    } catch (error) {
        res.status(500).send('Error fetching bar chart data: ' + error.message);
    }
};

// Function to get pie chart data
exports.getPieChart = async (req, res) => {
    const { month } = req.query;
    try {
        const pieChart = await getPieChartData(month);
        res.status(200).json(pieChart);
    } catch (error) {
        res.status(500).send('Error fetching pie chart data: ' + error.message);
    }
};

// Function to get combined data
exports.getCombinedData = async (req, res) => {
    const { month } = req.query;

    try {
        const statisticsPromise = getStatisticsData(month);
        const barChartPromise = getBarChartData(month);
        const pieChartPromise = getPieChartData(month);

        const [statistics, barChart, pieChart] = await Promise.all([statisticsPromise, barChartPromise, pieChartPromise]);

        res.status(200).json({
            statistics,
            barChart,
            pieChart
        });
    } catch (error) {
        res.status(500).send('Error fetching combined data: ' + error.message);
    }
};

