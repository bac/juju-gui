/* Copyright (C) 2017 Canonical Ltd. */

'use strict';

chai.config.includeStack = true;
chai.config.truncateThreshold = 0;

describe('jujulib payment service', function() {
  let parsedUser, returnedUser;

  const makeXHRRequest = function(obj) {
    return {target: {responseText: JSON.stringify(obj)}};
  };

  beforeEach(function() {
    returnedUser = {
      nickname: 'spinach',
      name: 'Geoffrey Spinach',
      email: 'spinach@example.com',
      business: true,
      addresses: [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      vat: '1234',
      'business-name': 'Spinachy business',
      'billing-addresses': [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      'payment-methods': [{
        address: {
          name: null,
          line1: null,
          line2: null,
          county: 'Bunnyhug',
          city: 'New Orleans',
          postcode: null,
          country: null,
          phones: []
        },
        brand: 'Brand',
        last4: '1234',
        month: 3,
        name: 'Main',
        valid: true,
        year: 2017
      }],
      'allow-email': true,
      valid: true
    };
    parsedUser = {
      nickname: 'spinach',
      name: 'Geoffrey Spinach',
      email: 'spinach@example.com',
      business: true,
      addresses: [{
        name: null,
        line1: null,
        line2: null,
        name: null,
        city: 'New Orleans',
        postcode: '70130',
        countryCode: null,
        phones: []
      }],
      vat: '1234',
      businessName: 'Spinachy business',
      billingAddresses: [{
        name: null,
        line1: null,
        line2: null,
        name: null,
        city: 'New Orleans',
        postcode: '70130',
        countryCode: null,
        phones: []
      }],
      paymentMethods: [{
        address: {
          name: null,
          line1: null,
          line2: null,
          state: 'Bunnyhug',
          city: 'New Orleans',
          postcode: null,
          country: null
        },
        brand: 'Brand',
        last4: '1234',
        month: 3,
        name: 'Main',
        valid: true,
        year: 2017
      }],
      allowEmail: true,
      valid: true
    };
  });

  it('exists', function() {
    const bakery = {};
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    assert.strictEqual(
      payment instanceof window.jujulib.payment, true);
    assert.strictEqual(
      payment.url,
      `http://1.2.3.4/${window.jujulib.paymentAPIVersion}`);
  });

  it('can get a user', function(done) {
    const bakery = {
      sendGetRequest: function(path, success, failure) {
        assert.equal(
          path,
          'http://1.2.3.4/' +
          window.jujulib.paymentAPIVersion +
          '/u/spinach');
        const xhr = makeXHRRequest(returnedUser);
        success(xhr);
      }
    };
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    payment.getUser('spinach', function(error, user) {
      assert.strictEqual(error, null);
      assert.deepEqual(user, parsedUser);
      done();
    });
  });

  it('can handle missing fields when getting a user', function(done) {
    const bakery = {
      sendGetRequest: function(path, success, failure) {
        assert.equal(
          path,
          'http://1.2.3.4/' +
          window.jujulib.paymentAPIVersion +
          '/u/spinach');
        const xhr = makeXHRRequest({
          'billing-addresses': [{
            city: 'New Orleans',
          }],
          'payment-methods': [{
            address: {
              city: 'New Orleans'
            }
          }]
        });
        success(xhr);
      }
    };
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    payment.getUser('spinach', function(error, user) {
      assert.strictEqual(error, null);
      assert.deepEqual(user, {
        nickname: null,
        name: null,
        email: null,
        business: false,
        addresses: [],
        vat: null,
        businessName: null,
        billingAddresses: [{
          name: null,
          line1: null,
          line2: null,
          name: null,
          city: 'New Orleans',
          postcode: null,
          countryCode: null,
          phones: []
        }],
        paymentMethods: [{
          address: {
            name: null,
            line1: null,
            line2: null,
            state: null,
            city: 'New Orleans',
            postcode: null,
            country: null
          },
          brand: null,
          last4: null,
          month: null,
          name: null,
          valid: false,
          year: null
        }],
        allowEmail: false,
        valid: false
      });
      done();
    });
  });

  it('handles errors when getting a user', function(done) {
    const bakery = {
      sendGetRequest: function(path, success, failure) {
        const xhr = makeXHRRequest({Message: 'Uh oh!'});
        failure(xhr);
      }
    };
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    payment.getUser('spinach', function(error, user) {
      assert.equal(error, 'Uh oh!');
      assert.isNull(user);
      done();
    });
  });

  it('can create a user', function() {
    const originalMakeRequest = jujulib._makeRequest;
    const makeRequest = sinon.stub();
    jujulib._makeRequest = makeRequest;
    const payment = new window.jujulib.payment('http://1.2.3.4/', {});
    const newUser = {
      name: 'Geoffrey Spinach',
      email: 'spinach@example.com',
      addresses: [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      vat: '1234',
      business: true,
      businessName: 'Spinachy business',
      billingAddresses: [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      allowEmail: true,
      token: '54321',
      paymentMethodName: 'Platinum'
    };
    payment.createUser(newUser, sinon.stub());
    // Restore the original method on the lib.
    jujulib._makeRequest = originalMakeRequest;
    assert.equal(makeRequest.callCount, 1);
    assert.deepEqual(makeRequest.args[0][3], {
      name: 'Geoffrey Spinach',
      email: 'spinach@example.com',
      addresses: [{
        name: null,
        line1: null,
        line2: null,
        city: 'New Orleans',
        postcode: '70130',
        'country-code': null,
        phones: []
      }],
      vat: '1234',
      business: true,
      'business-name': 'Spinachy business',
      'billing-addresses': [{
        name: null,
        line1: null,
        line2: null,
        city: 'New Orleans',
        postcode: '70130',
        'country-code': null,
        phones: []
      }],
      'allow-email': true,
      token: '54321',
      'payment-method-name': 'Platinum'
    });
  });

  it('can return the user when after creating a user', function() {
    const bakery = {
      sendPutRequest: function(path, params, success, failure) {
        assert.equal(
          path,
          'http://1.2.3.4/' +
          window.jujulib.paymentAPIVersion +
          '/u');
        const xhr = makeXHRRequest(returnedUser);
        success(xhr);
      }
    };
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    const newUser = {
      name: 'Geoffrey Spinach',
      email: 'spinach@example.com',
      addresses: [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      vat: '1234',
      business: true,
      businessName: 'Spinachy business',
      billingAddresses: [{
        city: 'New Orleans',
        postcode: '70130'
      }],
      allowEmail: true,
      token: '54321',
      paymentMethodName: 'Platinum'
    };
    payment.createUser(newUser, function(error, user) {
      assert.strictEqual(error, null);
      assert.deepEqual(user, parsedUser);
    });
  });

  it('handles errors when creating a user', function(done) {
    const bakery = {
      sendPutRequest: function(path, params, success, failure) {
        const xhr = makeXHRRequest({Message: 'Uh oh!'});
        failure(xhr);
      }
    };
    const payment = new window.jujulib.payment(
      'http://1.2.3.4/', bakery);
    payment.createUser({}, function(error, user) {
      assert.equal(error, 'Uh oh!');
      assert.isNull(user);
      done();
    });
  });

  it('can get a list of countries', function(done) {
    const countries = [{
      name: 'Australia',
      code: 'AU'
    }];
    const bakery = {
      sendGetRequest: (path, success, failure) => {
        assert.equal(
          path,
          'http://1.2.3.4/' +
          window.jujulib.paymentAPIVersion +
          '/country');
        const xhr = makeXHRRequest({countries: countries});
        success(xhr);
      }
    };
    const payment = new window.jujulib.payment('http://1.2.3.4/', bakery);
    payment.getCountries((error, response) => {
      assert.strictEqual(error, null);
      assert.deepEqual(response, countries);
      done();
    });
  });

  it('handles errors when getting the country list', function(done) {
    const bakery = {
      sendGetRequest: (path, success, failure) => {
        const xhr = makeXHRRequest({Message: 'Uh oh!'});
        failure(xhr);
      }
    };
    const payment = new window.jujulib.payment('http://1.2.3.4/', bakery);
    payment.getCountries((error, response) => {
      assert.equal(error, 'Uh oh!');
      assert.isNull(response);
      done();
    });
  });

});
