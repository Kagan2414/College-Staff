const bcrypt = require('bcrypt');

async function generatePasswords() {
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const staffPassword = await bcrypt.hash('Staff@123', 10);
  
  console.log('Admin Password Hash:', adminPassword);
  console.log('Staff Password Hash:', staffPassword);
  
  console.log('\n--- Use these in your SQL ---\n');
  console.log(`Admin: '${adminPassword}'`);
  console.log(`Staff: '${staffPassword}'`);
}

generatePasswords();