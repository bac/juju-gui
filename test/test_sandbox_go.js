/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2012-2013 Canonical Ltd.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License version 3, as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranties of MERCHANTABILITY,
SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

(function() {

  describe('sandbox.GoJujuAPI', function() {
    var requires = [
      'juju-env-sandbox', 'juju-tests-utils', 'juju-env-go',
      'juju-models', 'promise'];
    var Y, sandboxModule, ClientConnection, environmentsModule, state, juju,
        client, env, utils;

    before(function(done) {
      Y = YUI(GlobalConfig).use(requires, function(Y) {
        sandboxModule = Y.namespace('juju.environments.sandbox');
        environmentsModule = Y.namespace('juju.environments');
        utils = Y.namespace('juju-tests.utils');
        // A global variable required for testing.
        window.flags = {};
        done();
      });
    });

    beforeEach(function() {
      state = utils.makeFakeBackendWithCharmStore();
      juju = new sandboxModule.GoJujuAPI({state: state});
      client = new sandboxModule.ClientConnection({juju: juju});
      env = new environmentsModule.GoEnvironment({conn: client});
    });

    afterEach(function() {
      env.destroy();
      client.destroy();
      juju.destroy();
      state.destroy();
    });

    after(function() {
      delete window.flags;
    });

    it('opens successfully.', function() {
      assert.isFalse(juju.connected);
      assert.isUndefined(juju.get('client'));
      client.open();
      assert.isTrue(juju.connected);
      assert.strictEqual(juju.get('client'), client);
    });

    it('ignores "open" when already open to same client.', function() {
      client.receive = function() {
        assert.ok(false, 'The receive method should not be called.');
      };
      // Whitebox test: duplicate "open" state.
      juju.connected = true;
      juju.set('client', client);
      // This is effectively a re-open.
      client.open();
      // The assert.ok above is the verification.
    });

    it('refuses to open if already open to another client.', function() {
      // This is a simple way to make sure that we don't leave multiple
      // setInterval calls running.  If for some reason we want more
      // simultaneous clients, that's fine, though that will require
      // reworking the delta code generally.
      juju.connected = true;
      juju.set('client', {receive: function() {
        assert.ok(false, 'The receive method should not have been called.');
      }});
      assert.throws(
          client.open.bind(client),
          'INVALID_STATE_ERR : Connection is open to another client.');
    });

    it('closes successfully.', function() {
      client.open();
      assert.isTrue(juju.connected);
      assert.notEqual(juju.get('client'), undefined);
      client.close();
      assert.isFalse(juju.connected);
      assert.isUndefined(juju.get('client'));
    });

    it('ignores "close" when already closed.', function() {
      // This simply shows that we do not raise an error.
      juju.close();
    });

    it('can dispatch on received information.', function(done) {
      var data = {Type: 'TheType', Request: 'TheRequest'};
      juju.handleTheTypeTheRequest = function(received) {
        assert.notStrictEqual(received, data);
        assert.deepEqual(received, data);
        done();
      };
      client.open();
      client.send(Y.JSON.stringify(data));
    });

    it('refuses to dispatch when closed.', function() {
      assert.throws(
          juju.receive.bind(juju, {}),
          'INVALID_STATE_ERR : Connection is closed.'
      );
    });

    it('can log in.', function(done) {
      // See FakeBackend's authorizedUsers for these default authentication
      // values.
      var data = {
        Type: 'Admin',
        Request: 'Login',
        Params: {
          AuthTag: 'admin',
          Password: 'password'
        },
        RequestId: 42
      };
      client.onmessage = function(received) {
        // Add in the error indicator so the deepEqual is comparing apples to
        // apples.
        data.Error = false;
        assert.deepEqual(Y.JSON.parse(received.data), data);
        assert.isTrue(state.get('authenticated'));
        done();
      };
      state.logout();
      assert.isFalse(state.get('authenticated'));
      client.open();
      client.send(Y.JSON.stringify(data));
    });

    it('can log in (environment integration).', function(done) {
      state.logout();
      env.after('login', function() {
        assert.isTrue(env.userIsAuthenticated);
        done();
      });
      env.connect();
      env.setCredentials({user: 'admin', password: 'password'});
      env.login();
    });

    it('can deploy.', function(done) {
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      var data = {
        Type: 'Client',
        Request: 'ServiceDeploy',
        Params: {
          CharmUrl: 'cs:wordpress',
          ServiceName: 'kumquat',
          ConfigYAML: 'funny: business',
          NumUnits: 2
        },
        RequestId: 42
      };
      client.onmessage = function(received) {
        var receivedData = Y.JSON.parse(received.data);
        assert.equal(receivedData.RequestId, data.RequestId);
        assert.isUndefined(receivedData.Error);
        assert.isObject(
            state.db.charms.getById('cs:precise/wordpress-10'));
        var service = state.db.services.getById('kumquat');
        assert.isObject(service);
        assert.equal(service.get('charm'), 'cs:precise/wordpress-10');
        assert.deepEqual(service.get('config'), {funny: 'business'});
        var units = state.db.units.get_units_for_service(service);
        assert.lengthOf(units, 2);
        done();
      };
      client.open();
      client.send(Y.JSON.stringify(data));
    });

    it('can deploy (environment integration).', function() {
      env.connect();
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      var callback = function(result) {
        assert.isUndefined(result.err);
        assert.equal(result.charm_url, 'cs:wordpress');
        var service = state.db.services.getById('kumquat');
        assert.equal(service.get('charm'), 'cs:precise/wordpress-10');
        assert.deepEqual(service.get('config'), {llama: 'pajama'});
      };
      env.deploy(
          'cs:wordpress', 'kumquat', {llama: 'pajama'}, null, 1, callback);
    });

    it('can communicate errors after attempting to deploy', function(done) {
      env.connect();
      state.deploy('cs:wordpress', function() {});
      var callback = function(result) {
        assert.equal(
            result.err, 'A service with this name already exists.');
        done();
      };
      env.deploy('cs:wordpress', undefined, undefined, undefined, 1,
          callback);
    });

    it('can set a charm.', function(done) {
      state.deploy('cs:wordpress', function() {});
      var data = {
        Type: 'Client',
        Request: 'ServiceSetCharm',
        Params: {
          ServiceName: 'wordpress',
          CharmUrl: 'cs:precise/mediawiki-6',
          Force: false
        },
        RequestId: 42
      };
      client.onmessage = function(received) {
        var receivedData = Y.JSON.parse(received.data);
        assert.isUndefined(receivedData.err);
        var service = state.db.services.getById('wordpress');
        assert.equal(service.get('charm'), 'cs:precise/mediawiki-6');
        done();
      };
      client.open();
      client.send(Y.JSON.stringify(data));
    });

    it('can set a charm (environment integration).', function(done) {
      env.connect();
      state.deploy('cs:wordpress', function() {});
      var callback = function(result) {
        assert.isUndefined(result.err);
        var service = state.db.services.getById('wordpress');
        assert.equal(service.get('charm'), 'cs:precise/mediawiki-6');
        done();
      };
      env.setCharm('wordpress', 'cs:precise/mediawiki-6', false, callback);
    });

    /**
      Generates the services required for some tests. After the services have
      been generated it will call the supplied callback.

      This interacts directly with the fakebackend bypassing the environment.
      The test "can add additional units" tests this code directly so as long
      as it passes you can consider this method valid.

      @method generateServices
      @param {Function} callback The callback to call after the services have
        been generated.
    */
    function generateServices(callback) {
      state.deploy('cs:wordpress', function(service) {
        var data = {
          Type: 'Client',
          Request: 'AddServiceUnits',
          Params: {
            ServiceName: 'wordpress',
            NumUnits: 2
          }
        };
        state.nextChanges();
        client.onmessage = function(received) {
          // After done generating the services
          callback(received);
        };
        client.open();
        client.send(Y.JSON.stringify(data));
      });
    }

    /**
      Same as generateServices but uses the environment integration methods.
      Should be considered valid if "can add additional units (integration)"
      test passes.

      @method generateIntegrationServices
      @param {Function} callback The callback to call after the services have
        been generated.
    */
    function generateIntegrationServices(callback) {
      var localCb = function(result) {
        env.add_unit('kumquat', 2, function(data) {
          // After finished generating integrated services.
          callback(data);
        });
      };
      env.connect();
      env.deploy(
          'cs:wordpress', 'kumquat', {llama: 'pajama'}, null, 1, localCb);
    }

    /**
      Generates the services and then exposes them for the un/expose tests.
      After they have been exposed it calls the supplied callback.

      This interacts directly with the fakebackend bypassing the environment and
      should be considered valid if "can expose a service" test passes.

      @method generateAndExposeService
      @param {Function} callback The callback to call after the services have
        been generated.
    */
    function generateAndExposeService(callback) {
      state.deploy('cs:wordpress', function(data) {
        var command = {
          Type: 'Client',
          Request: 'ServiceExpose',
          Params: {ServiceName: data.service.get('name')}
        };
        state.nextChanges();
        client.onmessage = function(rec) {
          callback(rec);
        };
        client.open();
        client.send(Y.JSON.stringify(command));
      }, { unitCount: 1 });
    }

    /**
      Same as generateAndExposeService but uses the environment integration
      methods. Should be considered valid if "can expose a service
      (integration)" test passes.

      @method generateAndExposeIntegrationService
      @param {Function} callback The callback to call after the services have
        been generated.
    */
    function generateAndExposeIntegrationService(callback) {
      var localCb = function(result) {
        env.expose(result.service_name, function(rec) {
          callback(rec);
        });
      };
      env.connect();
      env.deploy(
          'cs:wordpress', 'kumquat', {llama: 'pajama'}, null, 1, localCb);
    }

    it('can add additional units', function(done) {
      function testForAddedUnits(received) {
        var service = state.db.services.getById('wordpress'),
            units = state.db.units.get_units_for_service(service),
            data = Y.JSON.parse(received.data),
            mock = {
              Response: {
                Units: ['wordpress/1', 'wordpress/2']
              }
            };
        // Do we have enough total units?
        assert.lengthOf(units, 3);
        // Does the response object contain the proper data
        assert.deepEqual(data, mock);
        // Error is undefined
        assert.isUndefined(data.Error);
        done();
      }
      // Generate the default services and add units
      generateServices(testForAddedUnits);
    });

    it('throws an error when adding units to an invalid service',
        function(done) {
          state.deploy('cs:wordpress', function(service) {
            var data = {
              Type: 'Client',
              Request: 'AddServiceUnits',
              Params: {
                ServiceName: 'noservice',
                NumUnits: 2
              }
            };
            state.nextChanges();
            client.onmessage = function() {
              client.onmessage = function(received) {
                var data = Y.JSON.parse(received.data);

                // If there is no error data.err will be undefined
                assert.equal(true, !!data.Error);
                done();
              };
              client.send(Y.JSON.stringify(data));
            };
            client.open();
            client.onmessage();
          });
        }
    );

    it('can add additional units (integration)', function(done) {
      function testForAddedUnits(data) {
        var service = state.db.services.getById('kumquat'),
            units = state.db.units.get_units_for_service(service);
        assert.lengthOf(units, 3);
        done();
      }
      generateIntegrationServices(testForAddedUnits);
    });

    it('can expose a service', function(done) {
      function checkExposedService(rec) {
        var serviceName = 'wordpress';
        var data = Y.JSON.parse(rec.data),
            mock = {Response: {}};
        var service = state.db.services.getById(serviceName);
        assert.equal(service.get('exposed'), true);
        assert.deepEqual(data, mock);
        done();
      }
      generateAndExposeService(checkExposedService);
    });

    it('can expose a service (integration)', function(done) {
      function checkExposedService(rec) {
        var service = state.db.services.getById('kumquat');
        assert.equal(service.get('exposed'), true);
        // The Go API does not set a result value.  That is OK as
        // it is never used.
        assert.isUndefined(rec.result);
        done();
      }
      generateAndExposeIntegrationService(checkExposedService);
    });

    it('fails silently when exposing an exposed service', function(done) {
      function checkExposedService(rec) {
        var service_name = 'wordpress',
            data = Y.JSON.parse(rec.data),
            service = state.db.services.getById(service_name),
            command = {
              Type: 'Client',
              Request: 'ServiceExpose',
              Params: {ServiceName: service_name}
            };
        state.nextChanges();
        client.onmessage = function(rec) {
          assert.equal(data.err, undefined);
          assert.equal(service.get('exposed'), true);
          done();
        };
        client.send(Y.JSON.stringify(command));
      }
      generateAndExposeService(checkExposedService);
    });

    it('fails with error when exposing an invalid service name',
        function(done) {
          state.deploy('cs:wordpress', function(data) {
            var command = {
              Type: 'Client',
              Request: 'ServiceExpose',
              Params: {ServiceName: 'foobar'}
            };
            state.nextChanges();
            client.onmessage = function(rec) {
              var data = Y.JSON.parse(rec.data);
              assert.equal(data.Error,
                 '"foobar" is an invalid service name.');
              done();
            };
            client.open();
            client.send(Y.JSON.stringify(command));
          }, { unitCount: 1 });
        }
    );

    it('can unexpose a service', function(done) {
      function unexposeService(rec) {
        var service_name = 'wordpress',
            data = Y.JSON.parse(rec.data),
            command = {
              Type: 'Client',
              Request: 'ServiceUnexpose',
              Params: {ServiceName: service_name}
            };
        state.nextChanges();
        client.onmessage = function(rec) {
          var data = Y.JSON.parse(rec.data),
              service = state.db.services.getById('wordpress'),
              mock = {Response: {}};
          assert.equal(service.get('exposed'), false);
          assert.deepEqual(data, mock);
          done();
        };
        client.send(Y.JSON.stringify(command));
      }
      generateAndExposeService(unexposeService);
    });

    it('can unexpose a service (integration)', function(done) {
      var service_name = 'kumquat';
      function unexposeService(rec) {
        function localCb(rec) {
          var service = state.db.services.getById(service_name);
          assert.equal(service.get('exposed'), false);
          // No result from Go unexpose.
          assert.isUndefined(rec.result);
          done();
        }
        env.unexpose(service_name, localCb);
      }
      generateAndExposeIntegrationService(unexposeService);
    });

    it('fails silently when unexposing a not exposed service',
        function(done) {
          var service_name = 'wordpress';
          state.deploy('cs:wordpress', function(data) {
            var command = {
              Type: 'Client',
              Request: 'ServiceUnexpose',
              Params: {ServiceName: service_name}
            };
            state.nextChanges();
            client.onmessage = function(rec) {
              var data = Y.JSON.parse(rec.data),
                  service = state.db.services.getById(service_name);
              assert.equal(service.get('exposed'), false);
              assert.equal(data.err, undefined);
              done();
            };
            client.open();
            client.send(Y.JSON.stringify(command));
          }, { unitCount: 1 });
        }
    );

    it('fails with error when unexposing an invalid service name',
        function(done) {
          function unexposeService(rec) {
            var data = Y.JSON.parse(rec.data),
                command = {
                  Type: 'Client',
                  Request: 'ServiceUnexpose',
                  Params: {ServiceName: 'foobar'}
                };
            state.nextChanges();
            client.onmessage = function(rec) {
              var data = Y.JSON.parse(rec.data);
              assert.equal(data.Error, '"foobar" is an invalid service name.');
              done();
            };
            client.send(Y.JSON.stringify(command));
          }
          generateAndExposeService(unexposeService);
        }
    );

    it('can add a relation', function(done) {
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      state.deploy('cs:wordpress', function() {
        state.deploy('cs:mysql', function() {
          var data = {
            RequestId: 42,
            Type: 'Client',
            Request: 'AddRelation',
            Params: {
              Endpoints: ['wordpress:db', 'mysql:db']
            }
          };
          client.onmessage = function(received) {
            var recData = Y.JSON.parse(received.data);
            assert.equal(recData.RequestId, data.RequestId);
            assert.equal(recData.Error, undefined);
            var recEndpoints = recData.Response.Endpoints;
            assert.equal(recEndpoints.wordpress.Name, 'db');
            assert.equal(recEndpoints.wordpress.Scope, 'global');
            assert.equal(recEndpoints.mysql.Name, 'db');
            assert.equal(recEndpoints.mysql.Scope, 'global');
            done();
          };
          client.open();
          client.send(Y.JSON.stringify(data));
        });
      });
    });

    it('can add a relation (integration)', function(done) {
      env.connect();
      env.deploy('cs:wordpress', null, null, null, 1, function() {
        env.deploy('cs:mysql', null, null, null, 1, function() {
          var endpointA = ['wordpress', {name: 'db', role: 'client'}],
              endpointB = ['mysql', {name: 'db', role: 'server'}];
          env.add_relation(endpointA, endpointB, function(recData) {
            assert.equal(recData.err, undefined);
            assert.equal(recData.endpoint_a, 'wordpress:db');
            assert.equal(recData.endpoint_b, 'mysql:db');
            assert.isObject(recData.result);
            done();
          });
        });
      });
    });

    it('is able to add a relation with a subordinate service', function(done) {
      state.deploy('cs:wordpress', function() {
        state.deploy('cs:puppet', function(service) {
          var data = {
            RequestId: 42,
            Type: 'Client',
            Request: 'AddRelation',
            Params: {
              Endpoints: ['wordpress:juju-info', 'puppet:juju-info']
            }
          };
          client.onmessage = function(received) {
            var recData = Y.JSON.parse(received.data);
            assert.equal(recData.RequestId, data.RequestId);
            assert.equal(recData.Error, undefined);
            var recEndpoints = recData.Response.Endpoints;
            assert.equal(recEndpoints.wordpress.Name, 'juju-info');
            assert.equal(recEndpoints.wordpress.Scope, 'container');
            assert.equal(recEndpoints.puppet.Name, 'juju-info');
            assert.equal(recEndpoints.puppet.Scope, 'container');
            done();
          };
          client.open();
          client.send(Y.JSON.stringify(data));
        });
      });
    });

    it('throws an error if only one endpoint is supplied', function(done) {
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      state.deploy('cs:wordpress', function() {
        var data = {
          RequestId: 42,
          Type: 'Client',
          Request: 'AddRelation',
          Params: {
            Endpoints: ['wordpress:db']
          }
        };
        client.onmessage = function(received) {
          var recData = Y.JSON.parse(received.data);
          assert.equal(recData.RequestId, data.RequestId);
          assert.equal(recData.Error,
              'Two string endpoint names required to establish a relation');
          done();
        };
        client.open();
        client.send(Y.JSON.stringify(data));
      });
    });

    it('throws an error if endpoints are not relatable', function(done) {
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      state.deploy('cs:wordpress', function() {
        var data = {
          RequestId: 42,
          Type: 'Client',
          Request: 'AddRelation',
          Params: {
            Endpoints: ['wordpress:db', 'mysql:foo']
          }
        };
        client.onmessage = function(received) {
          var recData = Y.JSON.parse(received.data);
          assert.equal(recData.RequestId, data.RequestId);
          assert.equal(recData.Error, 'Charm not loaded.');
          done();
        };
        client.open();
        client.send(Y.JSON.stringify(data));
      });
    });

    it('can remove a relation', function(done) {
      // We begin logged in.  See utils.makeFakeBackendWithCharmStore.
      var relation = ['wordpress:db', 'mysql:db'];
      state.deploy('cs:wordpress', function() {
        state.deploy('cs:mysql', function() {
          state.addRelation(relation[0], relation[1]);
          var data = {
            RequestId: 42,
            Type: 'Client',
            Request: 'DestroyRelation',
            Params: {
              Endpoints: relation
            }
          };
          client.onmessage = function(received) {
            var recData = Y.JSON.parse(received.data);
            assert.equal(recData.RequestId, data.RequestId);
            assert.equal(recData.Error, undefined);
            done();
          };
          client.open();
          client.send(Y.JSON.stringify(data));
        });
      });
    });

    it('can remove a relation(integration)', function(done) {
      env.connect();
      env.deploy('cs:wordpress', null, null, null, 1, function() {
        env.deploy('cs:mysql', null, null, null, 1, function() {
          var endpointA = ['wordpress', {name: 'db', role: 'client'}],
              endpointB = ['mysql', {name: 'db', role: 'server'}];
          env.add_relation(endpointA, endpointB, function() {
            env.remove_relation(endpointA, endpointB, function(recData) {
              assert.equal(recData.err, undefined);
              assert.equal(recData.endpoint_a, 'wordpress:db');
              assert.equal(recData.endpoint_b, 'mysql:db');
              done();
            });
          });
        });
      });
    });

  });

})();