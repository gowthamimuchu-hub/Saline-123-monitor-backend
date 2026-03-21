 require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[DB] MongoDB connected'))
  .catch(err => console.error('[DB] Error:', err));

const NurseSchema = new mongoose.Schema({
  nurseId:  { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone:    { type: String, required: true },
  ward:     { type: String, required: true },
  role:     { type: String, default: 'nurse' },
  createdAt:{ type: Date, default: Date.now }
});
NurseSchema.pre('save', async function(next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
  next();
});
const Nurse = mongoose.model('Nurse', NurseSchema);

const PatientSchema = new mongoose.Schema({
  patientId:     { type: String, required: true, unique: true },
  name:          { type: String, required: true },
  age:           { type: Number },
  gender:        { type: String },
  disease:       { type: String },
  bedNumber:     { type: String },
  ward:          { type: String },
  assignedNurse: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' },
  nursePhone:    { type: String },
  salineLevel:   { type: Number, default: 100 },
  flowRate:      { type: Number, default: 60 },
  healthStatus:  { type: String, default: 'Normal' },
  isActive:      { type: Boolean, default: true },
  updatedAt:     { type: Date, default: Date.now }
});
const Patient = mongoose.model('Patient', PatientSchema);

const ReadingSchema = new mongoose.Schema({
  patientId:   { type: String, required: true },
  salineLevel: { type: Number, required: true },
  timestamp:   { type: Date, default: Date.now }
});
const Reading = mongoose.model('Reading', ReadingSchema);

const AlertSchema = new mongoose.Schema({
  patientId:   { type: String },
  patientName: { type: String },
  bedNumber:   { type: String },
  message:     { type: String },
  salineLevel: { type: Number },
  smsSent:     { type: Boolean, default: false },
  callMade:    { type: Boolean, default: false },
  resolved:    { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});
const Alert = mongoose.model('Alert', AlertSchema);

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const esp32Auth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== (process.env.ESP32_API_KEY || 'esp32key123')) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
};

app.get('/', (req, res) => {
  res.json({ message: 'Smart Saline Monitor API is running!', status: 'ok' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nurseId, name, email, password, phone, ward, role } = req.body;
    if (!nurseId || !name || !email || !password || !phone || !ward)
      return res.status(400).json({ error: 'All fields required' });
    const exists = await Nurse.findOne({ $or: [{ email }, { nurseId }] });
    if (exists) return res.status(400).json({ error: 'Already registered' });
    const nurse = new Nurse({ nurseId, name, email, password, phone, ward, role: role || 'nurse' });
    await nurse.save();
    res.status(201).json({ message: 'Account created', nurseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const nurse = await Nurse.findOne({ email });
    if (!nurse) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, nurse.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: nurse._id, nurseId: nurse.nurseId, role: nurse.role, name: nurse.name },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '8h' }
    );
    res.json({ token, user: { id: nurse._id, nurseId: nurse.nurseId, name: nurse.name, role: nurse.role, ward: nurse.ward } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/readings', esp32Auth, async (req, res) => {
  try {
    const { patient_id, bed_number, saline_level, timestamp } = req.body;
    if (!patient_id || saline_level === undefined)
      return res.status(400).json({ error: 'patient_id and saline_level required' });
    await Reading.create({ patientId: patient_id, salineLevel: saline_level, timestamp: timestamp ? new Date(timestamp) : new Date() });
    const patient = await Patient.findOneAndUpdate(
      { patientId: patient_id },
      { salineLevel: saline_level, updatedAt: new Date() },
      { new: true }
    );
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const threshold = parseInt(process.env.SALINE_ALERT_THRESHOLD) || 20;
    if (saline_level <= threshold) {
      const recent = await Alert.findOne({ patientId: patient_id, resolved: false, createdAt: { $gte: new Date(Date.now() - 300000) } });
      if (!recent) {
        await Alert.create({ patientId: patient_id, patientName: patient.name, bedNumber: patient.bedNumber, message: `Saline low (${saline_level}%) for ${patient.name} Bed ${patient.bedNumber}`, salineLevel: saline_level, smsSent: true, callMade: true });
      }
    }
    console.log(`[ESP32] ${patient_id} → ${saline_level}%`);
    res.json({ success: true, patient_id, saline_level });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients', authMiddleware, async (req, res) => {
  try {
    const { ward, status, search } = req.query;
    const filter = { isActive: true };
    if (ward) filter.ward = ward;
    if (status) filter.healthStatus = status;
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { patientId: { $regex: search, $options: 'i' } }];
    const patients = await Patient.find(filter).populate('assignedNurse', 'name phone ward').sort({ updatedAt: -1 });
    res.json({ success: true, count: patients.length, patients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients', authMiddleware, async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();
    res.status(201).json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/patients/:id/status', authMiddleware, async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate({ patientId: req.params.id }, { healthStatus: req.body.healthStatus, updatedAt: new Date() }, { new: true });
    res.json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/patients/:id/discharge', authMiddleware, async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate({ patientId: req.params.id }, { isActive: false }, { new: true });
    res.json({ success: true, message: `${patient.name} discharged` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts', authMiddleware, async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nurses', authMiddleware, async (req, res) => {
  try {
    const nurses = await Nurse.find({}, '-password');
    res.json({ success: true, nurses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});

module.exports = app;
