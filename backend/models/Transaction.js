const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
    id: Number,
    title: String,
    description: String,
    price: Number,
    category: String,
    sold: Boolean,
    dateOfSale: Date,
    image: String
});

const Transaction = mongoose.model('Transaction', TransactionSchema);
module.exports = Transaction;
