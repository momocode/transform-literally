const chai = require('chai')

chai.use(require('chai-as-promised'))
chai.use(require('expect-to-be-a-promise'))

const expect = chai.expect

describe('transformations', () => {
  const {
    _internals: {
      IllegalSpecError, SPEC_FN, SPEC_PROMISE, ensureSpec
    }, map, constant, call, resolve,
    union, cases, object, input,
    bind, conditional, cache
  } = require('../index.js')
  describe('when autospeccing values', () => {
    it('should spec array constants', () => {
      const spec = ensureSpec([1, 2])
      expect(spec[SPEC_FN]).to.be.true
      expect(spec()).to.deep.equal([1, 2])
    })
    it('should recursively spec array constants', () => {
      const spec = ensureSpec([constant(1), constant(2)])
      expect(spec[SPEC_FN]).to.be.true
      expect(spec()).to.deep.equal([1, 2])
    })
    it('should spec simple objects', () => {
      const spec = ensureSpec({a: 1, b: 'a'})
      expect(spec[SPEC_FN]).to.be.true
      expect(spec()).to.deep.equal({a: 1, b: 'a'})
    })
    it('should recursively spec simple objects', () => {
      const spec = ensureSpec({a: constant(1), b: 'a'})
      expect(spec[SPEC_FN]).to.be.true
      expect(spec()).to.deep.equal({a: 1, b: 'a'})
    })
    it('should skip object keys that resolve to undefined', () => {
      const spec = ensureSpec({a: constant(undefined)})
      expect(spec()).to.deep.equal({})
    })
  })
  describe('when calling map', () => {
    it('should fail at evaluation if arraySpec evalutes to a non-array', () => {
      const spec = map(constant('not-an-array'), item => item)
      expect(() => spec()).to.throw(TypeError)
    })
    it('should accept only function for producing itemSpecFn', () => {
      expect(() => map([], 'not-a-function')).to.throw(IllegalSpecError)
    })
    it('should return a function with correct metadata', () => {
      const spec = map([], (item) => item)
      expect(spec[SPEC_FN]).to.be.true
    })
    it('should perform identity transform correctly', () => {
      const spec = map([1, 2], item => item)
      expect(spec()).to.deep.equal([1, 2])
    })
    it('should work with nesting in arraySpec', () => {
      const spec = map(map([1, 2], item => item), item => item)
      expect(spec()).to.deep.equal([1, 2])
    })
    it('should work with nesting in itemSpec', () => {
      const spec = map([[1], [2]], item => map(item, item => item))
      expect(spec()).to.deep.equal([[1], [2]])
    })
    it('should work with a promise in array argument', () => {
      const spec = map(resolve([1, 2]), item => item)
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      expect(result).to.eventually.deep.equal([1, 2])
    })
    it('should work with a promise in mapping argument', () => {
      const spec = map([1, 2], item => resolve(item))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal([1, 2])
    })
  })
  describe('when calling call', () => {
    it('should work with simple values', () => {
      const spec = call(a => a, 1)
      expect(spec()).to.equal(1)
    })
    it('should work with promises in arguments', () => {
      const spec = call(a => a, resolve(1))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal(1)
    })
  })
  describe('when calling union', () => {
    it('should work with simple and specced values', () => {
      const spec = union({a: 1}, {b: constant(2)})
      expect(spec()).to.deep.equal({a: 1, b: 2})
    })
  })
  describe('when calling cases', () => {
    it('should pick the right case', () => {
      const spec = cases(constant('b'), {'a': constant(1), 'b': constant(2)})
      expect(spec()).to.deep.equal(2)
    })
    it('should work with a promise in value argument', () => {
      const spec = cases(resolve('b'), {'a': 1, 'b': 2})
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal(2)
    })
    it('should work with a promise in cases argument', () => {
      const spec = cases('b', {'a': 1, 'b': resolve(2)})
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal(2)
    })
  })
  describe('when calling conditional', () => {
    it('should work with a simple trueish value', () => {
      const spec = conditional('truesy', 1, 2)
      expect(spec()).to.equal(1)
    })
    it('should work with a simple falsy value', () => {
      const spec = conditional('', 1, 2)
      expect(spec()).to.equal(2)
    })
    it('should work with a promise in value spec', () => {
      const spec = conditional(resolve(true), 1, 2)
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      expect(result).to.eventually.deep.equal(1)
    })
    it('should work with a promise in true spec', () => {
      const spec = conditional(true, resolve(1), 2)
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      expect(result).to.eventually.deep.equal(1)
    })
    it('should work with a promise in false spec', () => {
      const spec = conditional(false, 1, resolve(2))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      expect(result).to.eventually.deep.equal(2)
    })
  })
  describe('when calling object', () => {
    it('should work for simple values', () => {
      const spec = object(constant({a: 1, b: 2}), prop => prop('a'))
      expect(spec()).to.equal(1)
    })
    it('should resolve to undefined if object resolves to undefined', () => {
      const spec = object(constant(undefined), prop => 1)
      expect(spec()).to.be.undefined
    })
    it('should work with complex value in property spec', () => {
      const spec = object({a: 1}, prop => prop(constant('a')))
      expect(spec()).to.equal(1)
    })
    it('should work with a promise in object argument', () => {
      const spec = object(resolve({a: 1, b: 2}), prop => prop('a'))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
    it('should work with a promise in result argument', () => {
      const spec = object({a: 1, b: 2}, prop => resolve(prop('a')))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
  })
  describe('when calling input', () => {
    it('should work for simple values', () => {
      const spec = input(input => input)
      expect(spec(1)).to.equal(1)
      expect(spec({a: 2})).to.deep.equal({a: 2})
    })
    it('should work for complex spec', () => {
      const spec = input(input => ({a: input}))
      expect(spec(1)).to.deep.equal({a: 1})
    })
    it('should work with promises', () => {
      const spec = input(input => resolve(input))
      const result = spec(1)
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
  })
  describe('when calling bind', () => {
    it('should work for simple values', () => {
      const spec = bind(1, val => val)
      expect(spec()).to.equal(1)
    })
    it('should work for complex spec', () => {
      const spec = bind(constant(1), val => ({a: val}))
      expect(spec(1)).to.deep.equal({a: 1})
    })
    it('should work with promises in value argument', () => {
      const spec = bind(resolve(1), input => input)
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
    it('should work with promises in spec argument', () => {
      const spec = bind(1, input => resolve(input))
      expect(spec).to.have.property(SPEC_PROMISE)
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
  })
  describe('cache', () => {
    it('should evaluate value spec correctly using key', () => {
      const spec = cache(1, key => key)
      expect(spec()).to.equal(1)
    })
    it('should evaluate same key only once', () => {
      let calls = 0
      const spec = cache(1, key => call(() => ++calls))
      expect(spec()).to.equal(1)
      expect(spec()).to.equal(1)
    })
  })
  describe('when calling resolve', () => {
    it('should work with promises', () => {
      const spec = resolve(constant(Promise.resolve(1)))
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.equal(1)
    })
    it('should work with rejected promises', () => {
      const spec = resolve(constant(Promise.reject(new Error())))
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.be.rejected
    })
    it('should work with autospecced arrays', () => {
      const spec = ensureSpec([resolve(1)])
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal([1])
    })
    it('should work with autospecced objects', () => {
      const spec = ensureSpec({a: resolve(1)})
      const result = spec()
      expect(result).to.be.a.promise
      return expect(result).to.eventually.deep.equal({a: 1})
    })
  })
})
