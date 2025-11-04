const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Nodemailer configuration (Gmail SMTP - Update with your credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rlsauravkumar30@gmail.com',
    pass: 'llnklvvmwyfihfvw'
  }
});

// In-memory storage
let users = [];
let groups = [];
let otpStore = new Map();

// Transaction status constants
const TRANSACTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  REJECTED: 'rejected',
  PAYMENT_FAILED: 'payment_failed'
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP via Email
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    const subject = purpose === 'signup' 
      ? 'Welcome to Group Wallet - Verify Your Email'
      : 'Your Login OTP for Group Wallet';

    const html = purpose === 'signup' 
      ? `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007AFF; margin: 0;">Group Wallet</h1>
            <p style="color: #666; margin: 5px 0;">Multi-signature expense tracking</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
            <p style="color: #666; margin-bottom: 25px;">Use this OTP to complete your registration:</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; display: inline-block; margin: 10px 0;">
              <h1 style="font-size: 32px; color: #007AFF; margin: 0; letter-spacing: 5px;">
                ${otp}
              </h1>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 20px;">
              This OTP is valid for 10 minutes.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">
              If you didn't request this verification, please ignore this email.
            </p>
          </div>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007AFF; margin: 0;">Group Wallet</h1>
            <p style="color: #666; margin: 5px 0;">Multi-signature expense tracking</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center;">
            <h2 style="color: #333; margin-bottom: 20px;">Your Login OTP</h2>
            <p style="color: #666; margin-bottom: 25px;">Use this OTP to securely login to your account:</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; display: inline-block; margin: 10px 0;">
              <h1 style="font-size: 32px; color: #007AFF; margin: 0; letter-spacing: 5px;">
                ${otp}
              </h1>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 20px;">
              This OTP is valid for 10 minutes.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">
              If you didn't request this OTP, please secure your account immediately.
            </p>
          </div>
        </div>
      `;

    const mailOptions = {
      from: '"Group Wallet" <rlsauravkumar30@gmail.com>',
      to: email,
      subject: subject,
      html: html
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${otp}`);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

// Calculate available balance (only PAID transactions)
const calculateAvailableBalance = (group) => {
  if (!group || !group.transactions) return 0;
  
  const paidTransactions = group.transactions.filter(t => t.status === TRANSACTION_STATUS.PAID);
  return paidTransactions.reduce((total, t) => {
    return t.type === 'deposit' ? total + t.amount : total - t.amount;
  }, 0);
};

// Initialize demo data
const initializeDemoData = () => {
  users = [
    {
      id: 'demo-user-1',
      name: 'Alice',
      phone: '1111111111',
      email: 'alice@example.com',
      isVerified: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo-user-2',
      name: 'Bob',
      phone: '2222222222',
      email: 'bob@example.com',
      isVerified: true,
      createdAt: new Date().toISOString()
    }
  ];

  groups = [
    {
      id: 'demo-group-1',
      name: 'College Trip Group',
      code: 'TRIP2024',
      approvalThreshold: 2,
      members: [
        { name: "Alice", phone: "1111111111", email: "alice@example.com", isAdmin: true },
        { name: "Bob", phone: "2222222222", email: "bob@example.com", isAdmin: false }
      ],
      transactions: [
        {
          id: 'demo-trans-1',
          type: 'deposit',
          amount: 2000,
          description: 'Initial deposit for trip',
          status: TRANSACTION_STATUS.PAID,
          createdBy: '1111111111',
          approvals: ['1111111111', '2222222222'],
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      createdBy: '1111111111'
    }
  ];
};

// Initialize demo data on server start
initializeDemoData();

// ================= AUTHENTICATION ROUTES =================

// SIGNUP: Send OTP to email
app.post('/api/auth/signup', async (req, res) => {
  const { name, phone, email } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (phone.length !== 10 || !/^\d+$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ 
      error: 'Email already registered',
      existingPhone: existingUser.phone
    });
  }

  const existingPhone = users.find(u => u.phone === phone && u.email !== email);
  if (existingPhone) {
    return res.status(400).json({ 
      error: 'Phone number already registered with different email'
    });
  }

  try {
    const otp = generateOTP();
    
    otpStore.set(email, {
      otp,
      name,
      phone,
      purpose: 'signup',
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const emailSent = await sendOTPEmail(email, otp, 'signup');
    
    if (emailSent) {
      res.json({ 
        success: true, 
        message: 'OTP sent to your email',
        email 
      });
    } else {
      res.status(500).json({ error: 'Failed to send OTP email' });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// VERIFY SIGNUP OTP
app.post('/api/auth/verify-signup', (req, res) => {
  const { email, otp } = req.body;

  const otpData = otpStore.get(email);
  
  if (!otpData) {
    return res.status(400).json({ error: 'OTP expired or invalid' });
  }

  if (Date.now() > otpData.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (otpData.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  if (otpData.purpose !== 'signup') {
    return res.status(400).json({ error: 'Invalid OTP purpose' });
  }

  const newUser = {
    id: uuidv4(),
    name: otpData.name,
    phone: otpData.phone,
    email: email,
    isVerified: true,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  otpStore.delete(email);

  res.json({
    success: true,
    message: 'Account created successfully',
    user: newUser
  });
});

// LOGIN: Send OTP to registered email
app.post('/api/auth/login', async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  const user = users.find(u => u.phone === phone && u.name === name);
  
  if (!user) {
    return res.status(404).json({ 
      error: 'User not found. Please check your name and phone number.'
    });
  }

  try {
    const otp = generateOTP();
    
    otpStore.set(user.email, {
      otp,
      userId: user.id,
      purpose: 'login',
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const emailSent = await sendOTPEmail(user.email, otp, 'login');
    
    if (emailSent) {
      res.json({ 
        success: true, 
        message: `OTP sent to your registered email`,
        email: user.email,
        name: user.name,
        phone: user.phone
      });
    } else {
      res.status(500).json({ error: 'Failed to send OTP email' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// VERIFY LOGIN OTP
app.post('/api/auth/verify-login', (req, res) => {
  const { email, otp } = req.body;

  const otpData = otpStore.get(email);
  
  if (!otpData) {
    return res.status(400).json({ error: 'OTP expired or invalid' });
  }

  if (Date.now() > otpData.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (otpData.otp !== otp) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  if (otpData.purpose !== 'login') {
    return res.status(400).json({ error: 'Invalid OTP purpose' });
  }

  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  otpStore.delete(email);

  res.json({
    success: true,
    message: 'Login successful',
    user: user
  });
});

// ================= GROUP & TRANSACTION ROUTES =================

// Get all groups (for testing)
app.get('/api/groups', (req, res) => {
  res.json(groups);
});

// Get all groups for a user
app.get('/api/users/:phone/groups', (req, res) => {
  const userPhone = req.params.phone;
  const user = users.find(u => u.phone === userPhone);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userGroups = groups.filter(group => 
    group.members && group.members.some(member => member.phone === userPhone)
  );
  res.json(userGroups);
});

// Create a new group
app.post('/api/groups', (req, res) => {
  const { name, code, approvalThreshold, members, createdBy } = req.body;
  
  if (groups.some(group => group.code === code)) {
    return res.status(400).json({ error: 'Group code already exists' });
  }

  const newGroup = {
    id: uuidv4(),
    name,
    code,
    approvalThreshold: parseInt(approvalThreshold) || 2,
    members: members || [],
    transactions: [],
    createdAt: new Date().toISOString(),
    createdBy,
  };

  groups.push(newGroup);
  res.status(201).json(newGroup);
});

// Join a group
app.post('/api/groups/join', (req, res) => {
  const { code, user } = req.body;
  
  const group = groups.find(g => g.code === code);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (group.members && group.members.some(member => member.phone === user.phone)) {
    return res.status(400).json({ error: 'Already a member' });
  }

  if (!group.members) group.members = [];
  
  const userDetails = users.find(u => u.phone === user.phone);
  const memberToAdd = userDetails 
    ? { name: userDetails.name, phone: userDetails.phone, email: userDetails.email, isAdmin: false }
    : { ...user, isAdmin: false };
  
  group.members.push(memberToAdd);
  
  res.json(group);
});

// Get group by ID
app.get('/api/groups/:id', (req, res) => {
  const group = groups.find(g => g.id === req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  res.json(group);
});

// Update group
app.put('/api/groups/:id', (req, res) => {
  const groupIndex = groups.findIndex(g => g.id === req.params.id);
  if (groupIndex === -1) {
    return res.status(404).json({ error: 'Group not found' });
  }

  groups[groupIndex] = { ...groups[groupIndex], ...req.body };
  res.json(groups[groupIndex]);
});

// Delete group
app.delete('/api/groups/:id', (req, res) => {
  const groupIndex = groups.findIndex(g => g.id === req.params.id);
  if (groupIndex === -1) {
    return res.status(404).json({ error: 'Group not found' });
  }

  groups.splice(groupIndex, 1);
  res.json({ message: 'Group deleted successfully' });
});

// Create transaction
app.post('/api/groups/:groupId/transactions', (req, res) => {
  const { groupId } = req.params;
  const { type, amount, description, createdBy } = req.body;
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (!['deposit', 'withdrawal'].includes(type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const newTransaction = {
    id: uuidv4(),
    type,
    amount: parseFloat(amount),
    description: description || '',
    status: TRANSACTION_STATUS.PENDING,
    createdBy,
    createdAt: new Date().toISOString(),
    approvals: [],
    rejections: [],
  };

  if (!group.transactions) {
    group.transactions = [];
  }
  
  group.transactions.push(newTransaction);
  res.status(201).json(newTransaction);
});

// Approve transaction
app.post('/api/groups/:groupId/transactions/:transactionId/approve', (req, res) => {
  const { groupId, transactionId } = req.params;
  const { userId } = req.body;
  
  console.log(`Approval request: Group ${groupId}, Transaction ${transactionId}, User ${userId}`);
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const transaction = group.transactions?.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.status !== TRANSACTION_STATUS.PENDING) {
    return res.status(400).json({ error: `Transaction is already ${transaction.status}` });
  }

  transaction.approvals = transaction.approvals || [];
  transaction.rejections = transaction.rejections || [];

  transaction.rejections = transaction.rejections.filter(id => id !== userId);
  
  if (!transaction.approvals.includes(userId)) {
    transaction.approvals.push(userId);
  }

  const approvalCount = transaction.approvals.length;
  const rejectionCount = transaction.rejections.length;
  const totalMembers = group.members?.length || 0;
  const requiredApprovals = group.approvalThreshold || 2;

  console.log(`Voting: ${approvalCount} approve, ${rejectionCount} reject, Need ${requiredApprovals} approvals`);

  let newStatus = transaction.status;
  let needsPayment = false;

  if (approvalCount >= requiredApprovals) {
    if (transaction.type === 'deposit') {
      newStatus = TRANSACTION_STATUS.APPROVED;
      transaction.approvedAt = new Date().toISOString();
      needsPayment = true;
      console.log(`Deposit ${transactionId} APPROVED - waiting for payment`);
    } else if (transaction.type === 'withdrawal') {
      const currentBalance = calculateAvailableBalance(group);
      const balanceAfterWithdrawal = currentBalance - transaction.amount;
      
      if (balanceAfterWithdrawal < 0) {
        newStatus = TRANSACTION_STATUS.REJECTED;
        transaction.rejectedAt = new Date().toISOString();
        transaction.rejectedBy = 'system';
        transaction.rejectionReason = 'Not enough balance';
        console.log(`Withdrawal ${transactionId} AUTO-REJECTED - Would cause negative balance: ₹${balanceAfterWithdrawal}`);
      } else {
        newStatus = TRANSACTION_STATUS.APPROVED;
        transaction.approvedAt = new Date().toISOString();
        needsPayment = true;
        console.log(`Withdrawal ${transactionId} APPROVED - waiting for creator to complete withdrawal`);
      }
    }
  } else if ((approvalCount + rejectionCount) >= totalMembers && approvalCount < requiredApprovals) {
    newStatus = TRANSACTION_STATUS.REJECTED;
    transaction.rejectedAt = new Date().toISOString();
    console.log(`Transaction ${transactionId} REJECTED - all members voted but not enough approvals`);
  }

  transaction.status = newStatus;

  const currentBalance = calculateAvailableBalance(group);
  
  res.json({
    transaction,
    votingStatus: {
      approvals: approvalCount,
      rejections: rejectionCount,
      totalMembers: totalMembers,
      requiredApprovals: requiredApprovals,
      isApproved: newStatus === TRANSACTION_STATUS.APPROVED || newStatus === TRANSACTION_STATUS.PAID,
      isRejected: newStatus === TRANSACTION_STATUS.REJECTED,
      needsPayment: needsPayment,
      availableBalance: currentBalance
    }
  });
});

// Reject transaction
app.post('/api/groups/:groupId/transactions/:transactionId/reject', (req, res) => {
  const { groupId, transactionId } = req.params;
  const { userId } = req.body;
  
  console.log(`Rejection request: Group ${groupId}, Transaction ${transactionId}, User ${userId}`);
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const transaction = group.transactions?.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.status !== TRANSACTION_STATUS.PENDING) {
    return res.status(400).json({ error: `Transaction is already ${transaction.status}` });
  }

  transaction.approvals = transaction.approvals || [];
  transaction.rejections = transaction.rejections || [];

  transaction.approvals = transaction.approvals.filter(id => id !== userId);
  
  if (!transaction.rejections.includes(userId)) {
    transaction.rejections.push(userId);
  }

  const approvalCount = transaction.approvals.length;
  const rejectionCount = transaction.rejections.length;
  const totalMembers = group.members?.length || 0;
  const requiredApprovals = group.approvalThreshold || 2;

  console.log(`Voting: ${approvalCount} approve, ${rejectionCount} reject, Need ${requiredApprovals} approvals`);

  let newStatus = transaction.status;
  let needsPayment = false;

  if (approvalCount >= requiredApprovals) {
    if (transaction.type === 'deposit') {
      newStatus = TRANSACTION_STATUS.APPROVED;
      transaction.approvedAt = new Date().toISOString();
      needsPayment = true;
      console.log(`Deposit ${transactionId} APPROVED - waiting for payment`);
    } else if (transaction.type === 'withdrawal') {
      const currentBalance = calculateAvailableBalance(group);
      const balanceAfterWithdrawal = currentBalance - transaction.amount;
      
      if (balanceAfterWithdrawal < 0) {
        newStatus = TRANSACTION_STATUS.REJECTED;
        transaction.rejectedAt = new Date().toISOString();
        transaction.rejectedBy = 'system';
        transaction.rejectionReason = 'Not enough balance';
        console.log(`Withdrawal ${transactionId} AUTO-REJECTED - Would cause negative balance: ₹${balanceAfterWithdrawal}`);
      } else {
        newStatus = TRANSACTION_STATUS.APPROVED;
        transaction.approvedAt = new Date().toISOString();
        needsPayment = true;
        console.log(`Withdrawal ${transactionId} APPROVED - waiting for creator to complete withdrawal`);
      }
    }
  } else if ((approvalCount + rejectionCount) >= totalMembers && approvalCount < requiredApprovals) {
    newStatus = TRANSACTION_STATUS.REJECTED;
    transaction.rejectedAt = new Date().toISOString();
    console.log(`Transaction ${transactionId} REJECTED - all members voted but not enough approvals`);
  }

  transaction.status = newStatus;

  const currentBalance = calculateAvailableBalance(group);
  
  res.json({
    transaction,
    votingStatus: {
      approvals: approvalCount,
      rejections: rejectionCount,
      totalMembers: totalMembers,
      requiredApprovals: requiredApprovals,
      isApproved: newStatus === TRANSACTION_STATUS.APPROVED || newStatus === TRANSACTION_STATUS.PAID,
      isRejected: newStatus === TRANSACTION_STATUS.REJECTED,
      needsPayment: needsPayment,
      availableBalance: currentBalance
    }
  });
});

// Complete payment for deposit
app.post('/api/groups/:groupId/transactions/:transactionId/complete-payment', (req, res) => {
  const { groupId, transactionId } = req.params;
  const { paymentId, razorpayOrderId } = req.body;
  
  console.log(`Payment completion: Group ${groupId}, Transaction ${transactionId}`);
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const transaction = group.transactions?.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.status !== TRANSACTION_STATUS.APPROVED) {
    return res.status(400).json({ 
      error: 'Transaction not ready for payment',
      currentStatus: transaction.status
    });
  }

  if (transaction.type !== 'deposit') {
    return res.status(400).json({ error: 'Only deposits require payment' });
  }

  transaction.status = TRANSACTION_STATUS.PAID;
  transaction.paidAt = new Date().toISOString();
  transaction.paymentId = paymentId;
  transaction.razorpayOrderId = razorpayOrderId;
  transaction.paymentCompletedAt = new Date().toISOString();

  console.log(`Payment completed for transaction ${transactionId}`);

  const currentBalance = calculateAvailableBalance(group);

  res.json({
    success: true,
    transaction,
    message: 'Payment completed successfully',
    newBalance: currentBalance
  });
});

// Complete withdrawal with UPI
app.post('/api/groups/:groupId/transactions/:transactionId/complete-withdrawal', (req, res) => {
  const { groupId, transactionId } = req.params;
  const { upiId, paymentId } = req.body;
  
  console.log(`Withdrawal completion: Group ${groupId}, Transaction ${transactionId}, UPI: ${upiId}`);
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const transaction = group.transactions?.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.status !== TRANSACTION_STATUS.APPROVED) {
    return res.status(400).json({ 
      error: 'Withdrawal not ready for processing',
      currentStatus: transaction.status
    });
  }

  if (transaction.type !== 'withdrawal') {
    return res.status(400).json({ error: 'Only withdrawals can be processed' });
  }

  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (!upiRegex.test(upiId)) {
    return res.status(400).json({ error: 'Invalid UPI ID format' });
  }

  const currentBalance = calculateAvailableBalance(group);
  if (currentBalance < transaction.amount) {
    return res.status(400).json({ 
      error: 'Insufficient balance for withdrawal',
      availableBalance: currentBalance,
      withdrawalAmount: transaction.amount
    });
  }

  transaction.status = TRANSACTION_STATUS.PAID;
  transaction.paidAt = new Date().toISOString();
  transaction.paymentId = paymentId;
  transaction.upiId = upiId;
  transaction.withdrawalCompletedAt = new Date().toISOString();

  console.log(`✅ Withdrawal completed for transaction ${transactionId} to UPI: ${upiId}`);

  const newBalance = calculateAvailableBalance(group);

  res.json({
    success: true,
    transaction,
    message: `₹${transaction.amount} sent to UPI: ${upiId}`,
    newBalance: newBalance
  });
});

// Get payment details for a transaction
app.get('/api/groups/:groupId/transactions/:transactionId/payment-details', (req, res) => {
  const { groupId, transactionId } = req.params;
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const transaction = group.transactions?.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const response = {
    transactionId: transaction.id,
    amount: transaction.amount,
    description: transaction.description,
    type: transaction.type,
    status: transaction.status,
    needsPayment: transaction.status === TRANSACTION_STATUS.APPROVED,
    paymentId: transaction.paymentId,
    upiId: transaction.upiId,
    createdAt: transaction.createdAt,
    approvedAt: transaction.approvedAt,
    paidAt: transaction.paidAt,
    createdBy: transaction.createdBy
  };

  res.json(response);
});

// Get transactions that need payment (for a user)
app.get('/api/users/:phone/pending-payments', (req, res) => {
  const userPhone = req.params.phone;
  
  const pendingPayments = [];
  
  groups.forEach(group => {
    if (group.members?.some(member => member.phone === userPhone)) {
      const userPendingTransactions = group.transactions?.filter(t => 
        t.createdBy === userPhone && 
        t.status === TRANSACTION_STATUS.APPROVED
      );
      
      if (userPendingTransactions && userPendingTransactions.length > 0) {
        pendingPayments.push({
          groupId: group.id,
          groupName: group.name,
          transactions: userPendingTransactions
        });
      }
    }
  });
  
  res.json(pendingPayments);
});

// Admin update approval threshold
app.put('/api/groups/:groupId/threshold', (req, res) => {
  const { groupId } = req.params;
  const { newThreshold, adminUserId } = req.body;
  
  const group = groups.find(g => g.id === groupId);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (group.createdBy !== adminUserId) {
    return res.status(403).json({ error: 'Only admin can change approval threshold' });
  }

  const memberCount = group.members?.length || 0;
  if (newThreshold < 1 || newThreshold > memberCount) {
    return res.status(400).json({ error: `Threshold must be between 1 and ${memberCount}` });
  }

  group.approvalThreshold = newThreshold;
  
  res.json({
    message: `Approval threshold updated to ${newThreshold}`,
    group: group
  });
});

// Update user profile across all groups
app.put('/api/users/:phone', (req, res) => {
  const { phone } = req.params;
  const { name } = req.body;
  
  let updatedGroupsCount = 0;
  let updatedTransactionsCount = 0;
  
  groups.forEach(group => {
    let groupUpdated = false;
    
    if (group.members) {
      group.members = group.members.map(member => {
        if (member.phone === phone) {
          groupUpdated = true;
          return { ...member, name };
        }
        return member;
      });
    }
    
    if (group.transactions) {
      group.transactions = group.transactions.map(transaction => {
        if (transaction.createdBy === phone) {
          updatedTransactionsCount++;
          return { ...transaction, createdBy: name };
        }
        return transaction;
      });
    }
    
    if (groupUpdated) updatedGroupsCount++;
  });
  
  res.json({ 
    message: `User updated in ${updatedGroupsCount} groups and ${updatedTransactionsCount} transactions`,
    name 
  });
});

// ================= UTILITY ROUTES =================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    users: users.length,
    groups: groups.length,
    serverTime: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Get all users (for debugging)
app.get('/api/debug/users', (req, res) => {
  res.json(users);
});

// Reset demo data (for testing)
app.post('/api/reset-demo', (req, res) => {
  initializeDemoData();
  res.json({ message: 'Demo data reset successfully', users: users.length, groups: groups.length });
});

// Debug endpoint to fix transactions
app.post('/api/debug/fix-creators', (req, res) => {
  const { userPhone, userName } = req.body;
  let fixedCount = 0;
  
  groups.forEach(group => {
    if (group.transactions) {
      group.transactions.forEach(transaction => {
        if (transaction.createdBy === userName || transaction.createdBy.trim() === userName) {
          transaction.createdBy = userPhone;
          fixedCount++;
        }
      });
    }
  });
  
  res.json({ 
    message: `Fixed ${fixedCount} transactions for user ${userName}`,
    userPhone,
    userName
  });
});

// Clean expired OTPs every hour
setInterval(() => {
  const now = Date.now();
  for (const [email, otpData] of otpStore.entries()) {
    if (now > otpData.expiresAt) {
      otpStore.delete(email);
      console.log(`Cleaned expired OTP for ${email}`);
    }
  }
}, 60 * 60 * 1000);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email authentication: ENABLED`);
  console.log(`🔐 OTP via Nodemailer: ACTIVE`);
  console.log(`👥 Demo users: ${users.length}`);
  console.log(`📊 Demo groups: ${groups.length}`);
  console.log(`💳 Payment system: ENABLED`);
  console.log(`💸 Withdrawal system: UPI-based`);

});

