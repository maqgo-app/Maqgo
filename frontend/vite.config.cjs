module.exports = async (...args) => {
  const mod = await import('./vite.config.js')
  const config = mod?.default
  if (typeof config === 'function') return await config(...args)
  return config
}

