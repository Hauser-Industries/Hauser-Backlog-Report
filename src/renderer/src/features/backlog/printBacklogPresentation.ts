export function printableCustomerName(customerName: string): string {
  const storeName = customerName
    .trim()
    .replace(/\s*-\s*HAUSER COMPANY STORES\s*$/i, '')
    .trim()
    .toLocaleLowerCase('en-CA')

  return storeName.replace(/(^|[\s-])([a-z])/g, (_, separator: string, letter: string) =>
    `${separator}${letter.toUpperCase()}`
  )
}
