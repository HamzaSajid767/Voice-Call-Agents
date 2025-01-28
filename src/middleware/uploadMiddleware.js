import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    // Allow larger tour payloads (e.g., long routes as JSON + images).
    // Tune via env as needed without code changes.
    fileSize: Number(process.env.UPLOAD_FILE_SIZE_LIMIT_BYTES || 15 * 1024 * 1024), // 15MB
    fieldSize: Number(process.env.UPLOAD_FIELD_SIZE_LIMIT_BYTES || 10 * 1024 * 1024), // 10MB
    files: Number(process.env.UPLOAD_FILES_LIMIT || 5),
    fields: Number(process.env.UPLOAD_FIELDS_LIMIT || 50),
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'gpxFile') {
      if (!file.originalname.toLowerCase().endsWith('.gpx')) {
        return cb(new Error('Only GPX files are allowed for gpxFile field'));
      }
    }
    if (file.fieldname === 'coverImage') {
      if (!file.mimetype?.toLowerCase().startsWith('image/')) {
        return cb(new Error('Only image files are allowed for coverImage field'));
      }
    }
    if (file.fieldname === 'image') {
      if (!file.mimetype?.toLowerCase().startsWith('image/')) {
        return cb(new Error('Only image files are allowed'));
      }
    }
    cb(null, true);
  },
});

export default upload;
