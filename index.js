const SPEC_FN = Symbol('SpecFn')
const SPEC_PROMISE = Symbol('SpecPromise')

class IllegalSpecError extends Error {
}

function constant (value) {
  return makeSpecFn(() => value)
}

function map (arraySpec, itemSpecFn) {
  arraySpec = ensureSpec(arraySpec)
  requireFunction(itemSpecFn)
  const currentItem = Symbol('Map.CurrentItem')
  const itemSpec = ensureSpec(itemSpecFn(makeSpecFn(ctx => ctx[currentItem])))
  const itemPromises = itemSpec[SPEC_PROMISE]
  return makeSpecFn({
    fn (ctx, array) {
      if (!Array.isArray(array))
        throw new TypeError('Argument did not evaluate to an array: ' + typeof array)
      const result = array.map(item => {
        const newCtx = Object.assign({}, ctx, {[currentItem]: item})
        return itemSpec(newCtx)
      })
      if (itemPromises)
        return Promise.all(result)
      return result
    },
    hasPromises: itemPromises
  }, arraySpec)
}

function resolve (promiseSpec) {
  promiseSpec = ensureSpec(promiseSpec)
  return makeSpecFn({
    fn (ctx, promise) {
      return Promise.resolve(promise)
    },
    hasPromises: true
  }, promiseSpec)
}

function call (fn, ...argumentSpec) {
  requireFunction(fn)
  argumentSpec = ensureSpec(argumentSpec)
  return makeSpecFn((ctx, args) => fn(...args), argumentSpec)
}

function union (...specs) {
  specs = specs.map(ensureSpec)
  return makeSpecFn((ctx, ...objs) => Object.assign({}, ...objs), ...specs)
}

function cases (spec, caseSpecs) {
  spec = ensureSpec(spec)
  let hasPromises = spec[SPEC_PROMISE]
  for (let caseName in caseSpecs) {
    const caseSpec = ensureSpec(caseSpecs[caseName])
    caseSpecs[caseName] = caseSpec
    hasPromises = hasPromises || caseSpec[SPEC_PROMISE]
  }
  let fn
  if (!hasPromises) {
    fn = ctx => {
      const caseValue = spec(ctx)
      const caseSpec = caseSpecs[caseValue]
      if (!caseSpec)
        return undefined
      return caseSpec(ctx)
    }
  } else {
    fn = ctx => {
      return Promise.resolve(spec(ctx))
      .then(caseValue => {
        const caseSpec = caseSpecs[caseValue]
        if (!caseSpec)
          return undefined
        return caseSpec(ctx)
      })
    }
    fn[SPEC_PROMISE] = true
  }
  fn[SPEC_FN] = true
  return fn
}

function conditional (valueSpec, trueSpec, falseSpec) {
  valueSpec = ensureSpec(valueSpec)
  trueSpec = ensureSpec(trueSpec)
  falseSpec = ensureSpec(falseSpec)
  return makeSpecFn({
    fn (ctx, value) {
      if (value)
        return trueSpec(ctx)
      return falseSpec(ctx)
    },
    hasPromises: trueSpec[SPEC_PROMISE] || falseSpec[SPEC_PROMISE]
  }, valueSpec)
}

function object (objectSpec, resultSpecFn) {
  objectSpec = ensureSpec(objectSpec)
  const currentObject = Symbol('Object.CurrentObject')
  const resultSpec = ensureSpec(resultSpecFn((propertySpec, required) => {
    propertySpec = ensureSpec(propertySpec)
    return makeSpecFn((ctx, property) => {
      const obj = ctx[currentObject]
      if (required && !(property in obj))
        throw TypeError('Required property missing: ' + property)
      return ctx[currentObject][property]
    }, propertySpec)
  }))
  return makeSpecFn({
    fn (ctx, obj) {
      if (!obj)
        return undefined
      const newCtx = Object.assign({}, ctx, {[currentObject]: obj})
      return resultSpec(newCtx)
    },
    hasPromises: resultSpec[SPEC_PROMISE]
  }, objectSpec)
}

function input (specFn) {
  const givenInput = Symbol('Input.GivenInput')
  const spec = ensureSpec(specFn(makeSpecFn(ctx => ctx[givenInput])))
  return input => {
    return spec({[givenInput]: input})
  }
}

function bind (valueSpec, specFn) {
  valueSpec = ensureSpec(valueSpec)
  const currentValue = Symbol('Bind.CurrentValue')
  const spec = ensureSpec(specFn(makeSpecFn(ctx => ctx[currentValue])))
  return makeSpecFn({
    fn (ctx, value) {
      const newCtx = Object.assign({}, ctx, {[currentValue]: value})
      return spec(newCtx)
    },
    hasPromises: spec[SPEC_PROMISE]
  }, valueSpec)
}

function cache (keySpec, valueSpecFn) {
  keySpec = ensureSpec(keySpec)
  const currentKey = Symbol('Cache.Key')
  const valueSpec = ensureSpec(valueSpecFn(makeSpecFn(ctx => ctx[currentKey])))
  const cache = new Map()
  return makeSpecFn({
    fn (ctx, keyValue) {
      if (!cache.has(keyValue)) {
        const newCtx = Object.assign({}, ctx, {[currentKey]: keyValue})
        cache.set(keyValue, valueSpec(newCtx))
      }
      return cache.get(keyValue)
    },
    hasPromises: valueSpec[SPEC_PROMISE]
  }, keySpec)
}

function ensureSpec (spec) {
  // If it is a spec already, it's fine
  if (spec && spec[SPEC_FN])
    return spec

  // Autospec arrays
  if (Array.isArray(spec)) {
    spec = spec.map(ensureSpec)
    return makeSpecFn((ctx, ...items) => items, ...spec)
  }

  // Autospec objects
  if (typeof spec === 'object') {
    const names = []
    const specs = []
    const objSpec = Object.assign({}, spec)
    for (let prop in objSpec) {
      names.push(prop)
      specs.push(ensureSpec(objSpec[prop]))
    }
    const propsLen = names.length
    return makeSpecFn((ctx, ...attrs) => {
      const obj = {}
      for (let i = 0; i < propsLen; ++i)
        if (attrs[i] !== undefined)
          obj[names[i]] = attrs[i]
      return obj
    }, ...specs)
  }

  return constant(spec)
}

function makeSpecFn (fn, ...specs) {
  let evalFn = (ctx, ...specs) => specs.map(spec => spec(ctx))
  let hasPromises = false
  if (typeof fn !== 'function') {
    evalFn = fn.evalFn || evalFn
    hasPromises = fn.hasPromises
    fn = fn.fn
  }
  hasPromises = hasPromises || specs.some(spec => spec[SPEC_PROMISE])
  let specFn
  if (hasPromises) {
    specFn = ctx => Promise.all(evalFn(ctx, ...specs)).then(args => fn(ctx, ...args))
    specFn[SPEC_PROMISE] = true
  } else {
    specFn = ctx => fn(ctx, ...evalFn(ctx, ...specs))
  }
  specFn[SPEC_FN] = true
  return specFn
}

function requireFunction (fn) {
  if (typeof fn !== 'function')
    throw new IllegalSpecError('argument must be function')
}

module.exports = {
  _internals: {
    IllegalSpecError, SPEC_FN, SPEC_PROMISE, ensureSpec
  },
  constant,
  map,
  call,
  resolve,
  union,
  cases,
  object,
  input,
  bind,
  conditional,
  cache
}
