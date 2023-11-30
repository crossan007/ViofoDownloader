export function truncateWithEllipsis(str: string, maxLength: number): string {
  if (str.length > maxLength) {
      return str.substring(0, maxLength - 3) + '...';
  }
  return str;
}


export function formatString(str: string, targetLength: number): string {
  // Truncate with ellipsis if the string is longer than the target length
  if (str.length > targetLength) {
      return str.substring(0, targetLength - 3) + '...';
  }
  // Pad with spaces if the string is shorter than the target length
  else if (str.length < targetLength) {
      return str.padEnd(targetLength, ' ');
  }
  // Return the original string if it's already the target length
  return str;
}