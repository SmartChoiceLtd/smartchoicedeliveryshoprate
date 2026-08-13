for (const driver of driversToSend) {
    const code = (driver.code || '').toUpperCase();
    const orders = byDriver[code] || [];
    if (!orders.length) continue;
    try {
      await sendDriverPayEmail(driver, orders, week_end, rates);
      results.push({ driver: code, status: 'sent', deliveries: orders.length });
      console.log('Pay email sent to:', driver.name, driver.email);
    } catch(e) {
      results.push({ driver: code, status: 'failed', error: e.message });
      console.error('Pay email failed:', driver.name, e.message);
    }
  }
