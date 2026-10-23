import { MongoClient } from 'mongodb';
import { getMongoDatabase, getMongoUri } from './config.js';
import { AppError } from './errors.js';

const cache = globalThis;

function ensureIndexes(database) {
  if (!cache.__uarIndexPromise) {
    cache.__uarIndexPromise = database
      .collection('issues')
      .createIndex({ createdAt: -1 })
      .catch((error) => {
        console.error('MongoDB index creation failed:', error);
      });
  }
}

export async function getDatabase() {
  const uri = getMongoUri();

  if (!uri) {
    throw new AppError(
      503,
      'Database not configured',
      'The MONGODB_URI environment variable is missing.',
    );
  }

  if (!cache.__uarClientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    cache.__uarClient = client;

    cache.__uarClientPromise = client
      .connect()
      .then((connectedClient) => {
        const database = connectedClient.db(getMongoDatabase());
        ensureIndexes(database);
        return database;
      })
      .catch(async (error) => {
        cache.__uarClientPromise = undefined;

        try {
          await client.close();
        } catch {
          // Ignore cleanup failures; the connection already failed.
        }

        console.error('MongoDB connection failed:', error);

        throw new AppError(
          503,
          'Database unavailable',
          'The database could not be reached. Try again in a moment.',
        );
      });
  }

  return cache.__uarClientPromise;
}

export async function pingDatabase(timeoutMs = 5000) {
  const database = await getDatabase();
  let timer;

  try {
    await Promise.race([
      database.command({ ping: 1 }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AppError(
              503,
              'Database is not reachable',
              'The database did not respond in time.',
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
