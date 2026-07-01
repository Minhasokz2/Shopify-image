// Dummy-but-valid values so config/env.js's zod validation passes during tests. Real Firestore
// (and every other external SDK) is mocked at the module boundary in individual test files —
// nothing here is used to make a live network call.
process.env.NODE_ENV = 'test';
process.env.SHOPIFY_API_KEY ??= 'test_api_key';
process.env.SHOPIFY_API_SECRET ??= 'test_api_secret';
process.env.SHOPIFY_APP_URL ??= 'https://visualkit-test.example.com';
process.env.SHOPIFY_SCOPES ??= 'read_products,write_products,read_product_listings';
process.env.FAL_KEY ??= 'test_fal_key';
process.env.OPENAI_API_KEY ??= 'test_openai_key';
process.env.ANTHROPIC_API_KEY ??= 'test_anthropic_key';
process.env.WAVESPEED_API_KEY ??= 'test_wavespeed_key';
// A structurally-valid (but not-connected-to-anything-real) RSA key, so that any test which
// transitively imports lib/firestore.js without mocking it (e.g. via config/shopify.js) doesn't
// crash at import time. No network call is made unless a test actually reads/writes Firestore
// without mocking — those tests mock lib/firestore.js directly instead (see fakeFirestore.js).
process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??= JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu\nNMoSfm76oqFvAp8Gy0iz5sxjZmSnXyCdPEovGhLa0VzMaQ8s+CLOyS56YyCFGeJZ\nqgtzJ6GR3eqoYSW9b9UMvkBpZODSctWSNGj3P7jRFDO5VoTwCQAWbFnOjDfH5Ulg\np2PKSQnSJP3AJLQNFNe7br1XbrhV//eO+t51mIpGSDCUv3E0DDFcWDTH9cXDTTlR\nZVEiR2BwpZOOkE/Z0/BVnhZYL71oZV34bKfWjQIt6V/isSMahdsAASACp4ZTGtwi\nVuNd9tVfAgMBAAECggEAWDBmvVi9BhCVh4h3xn8gcCwYPQpjfXBTZzIeCddOnFj+\nJTAyIYRUM4uNJdEUwlY0EnPXQhLZBqR/HCwbz/JmS/E4S5J6NBjnBrezaobHVUgP\ngv2fbfKZzP1G3sTAiNlIH51F91mNJfDD8+lXDNCFPnrq0Yac4LDNLZTb1jgv/pJZ\nGoRRxs2CG7uYCrp3nDaozeqCVEHFsvNc5dtXfzKlLJa5Aa2XPjXLL9jm7BvcYqxb\nRPnI5CxjB+dqf9CUdVDQ2j4gfQpNHTJhOKY3n7f4rgpFqDMc+VYQ1EGrDPXaCgqW\nsAJVQq7QK6cBOaEJDrPBUgpkFV2/dhOEO/1RZk8FQQKBgQD1qLm34mfaEIA7DAKw\nz3XZ0vG5g9crCPJcVvXTF9NNzOItRFa1Wa/DfnzD9uJZKcYZL16nLTQMz5wOenN0\nOEpZoQeQtRRQGpZ8v/RfhLZmQjxjZ8LC3jGDrHm0lWvfPTGRixTr0lONp1iaJHTQ\nsCPKgYuzOEigcz1u/DKQjNQVIQKBgQDDPTx7wNjy4d1qzHYWD/6xLZq0zIvUsBt2\n8gGY3S5CmXjLZoFy2xxHDVjEDdI5c5UwsMjWQZzHOHGT4nOEC2LM71lPq0EK4jyF\nvS2b/CCHl+xbFxlnkQtDGRZeuhZL8kV8ZeBS0j2Q7hDNTQIcNGm23HHqxE6R/hyb\nAcnwoLdMxwKBgQC/AYaHYqRc9SwsFV1Sazlj/xEZQz6DgnZgqZmoW5v9pDo1yYqm\nT61c1lQV0IMSblG5nSQ5wDgOJoccOr7VLPXawGY1JeqzTOOEnE9nl6PPGVi30nEP\nn6ZBTk5UtsQq3sYX3ORVX3wZuOa2rDcU0zysX9TQyFH1L3jNSQvfC1XswQKBgFF+\nCT0DFEqsWTFCLoiTBqzvHZa2GLehLPZaMYSblfXHZzFtQlnk1WKlZqCmYpx8LtqU\nS+dLZW9BvSBWKh8xLIm4o/wCF6zqxwYcVKehLbtoNftKjZ8bDh92sTLDfXFa+RG9\n1PMTZjSwlmR+bLm6phW3fMTfOztRTfBTWGiE73obAoGAQzQ/x8fEo/DhSwtNH8OS\nQwj5MO0lXcHOKmTgZaJn6RM4ML2/9AVdJ9v6PPfvpGmqf+43GRoiHaGwvJT9TKKO\nb7X0y6uEqUpGHIt0KFtVLQ2LkzYAxE1Xhz5sZAaJRJcw3lPBK7DLTqSJyDdWTt/j\nGl2vwr1oAiaSPuNRJqxYAYo=\n-----END PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
});
process.env.CLOUDFLARE_R2_ACCESS_KEY ??= 'test_r2_access';
process.env.CLOUDFLARE_R2_SECRET_KEY ??= 'test_r2_secret';
process.env.CLOUDFLARE_R2_BUCKET ??= 'test-bucket';
process.env.CLOUDFLARE_R2_ACCOUNT_ID ??= 'test-account-id';
process.env.RESEND_API_KEY ??= 'test_resend_key';
process.env.ADMIN_API_KEY ??= 'test_admin_key_at_least_16_chars';
