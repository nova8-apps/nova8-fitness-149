// Check users script - to be run with Node.js (not Bun)
import { db } from './db';
import { users } from '../db/schema';

async function checkUsers() {
  try {
    const allUsers = await db.select().from(users);
    console.log('\n=== Database Users ===');
    console.log('Total users:', allUsers.length);
    if (allUsers.length > 0) {
      console.log('\nUser details:');
      allUsers.forEach(u => {
        console.log(`- Email: ${u.email}, ID: ${u.id}, Name: ${u.name || '(none)'}, Created: ${new Date(u.createdAt).toISOString()}`);
      });
    } else {
      console.log('No users found in database.');
    }
  } catch (err) {
    console.error('Error checking users:', err);
  }
}

checkUsers().catch(console.error);
