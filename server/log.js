export default function log(message) {
    const date = new Date()
    const timestamp = date.toLocaleString('en-GB', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false  // Use 24-hour format
    }).replace(',', '')

    console.log(`[${timestamp}] ${message}`)
}