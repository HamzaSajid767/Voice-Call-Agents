// Runs before Jest test modules. Required so `config/env` validation passes when test files import the app.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0';
process.env.JWT_SECRET = process.env.JWT_SECRET || '0'.repeat(32);
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'livekit_key_test';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'livekit_secret_test_32_bytes_long____';
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'AC' + '0'.repeat(32);
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'twilio_token_test_32b________________';
