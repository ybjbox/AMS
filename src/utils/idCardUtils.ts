export const generateIdCard = (): string => {
  const year = 1970 + Math.floor(Math.random() * 30);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `440106${year}${month}${day}${Math.floor(Math.random() * 9000) + 1000}`;
};

export const calculateAge = (idCard: string): number => {
  if (!idCard || idCard.length !== 18) return 0;
  const year = parseInt(idCard.substring(6, 10));
  const month = parseInt(idCard.substring(10, 12));
  const day = parseInt(idCard.substring(12, 14));
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age;
};

export const getGender = (idCard: string): '男' | '女' => {
  if (!idCard || idCard.length !== 18) return '男'; // Default
  return parseInt(idCard.charAt(16)) % 2 === 0 ? '女' : '男';
};
