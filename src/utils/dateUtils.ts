export const calculateYearsOfService = (joinDate: string): string => {
  if (!joinDate) return '-';
  const join = new Date(joinDate);
  const today = new Date();
  let years = today.getFullYear() - join.getFullYear();
  let months = today.getMonth() - join.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < join.getDate())) {
    years--;
    months += 12;
  }
  return `${years}年${months}个月`;
};

export const calculateDaysToExpiry = (expiryDate: string): number => {
  if (!expiryDate) return 0;
  const expiry = new Date(expiryDate);
  const today = new Date();
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
