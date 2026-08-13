const filterCode = (body.driver_code || '').toUpperCase();
  const driversToSend = filterCode === 'ALL' || !filterCode
    ? activeDrivers
    : activeDrivers.filter(d => (d.code || '').toUpperCase() === filterCode);

  for (const driver of driversToSend) {
    const code = (driver.code || '').toUpperCase();
