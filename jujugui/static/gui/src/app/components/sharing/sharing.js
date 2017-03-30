/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2017 Canonical Ltd.

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

YUI.add('sharing', function() {

  /**
    Modal component for viewing which users have access to the model, as well
    as sharing access with other users.
  */
  juju.components.Sharing = React.createClass({
    propTypes: {
      addNotification: React.PropTypes.func,
      canShareModel: React.PropTypes.bool,
      closeHandler: React.PropTypes.func,
      getModelUserInfo: React.PropTypes.func.isRequired,
      grantModelAccess: React.PropTypes.func.isRequired,
      humanizeTimestamp: React.PropTypes.func,
      revokeModelAccess: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
      this.xhrs = [];

      return {
        canAdd: false,
        loadingUsers: false,
        usersWithAccess: []
      };
    },

    getDefaultProps: function() {
      return {
        addNotification: () => {
          console.log('No addNotification specified.');
        },
        canShareModel: false,
        closeHandler: () => {
          console.log('No closeHandler specified.');
        },
        humanizeTimestamp: timestamp => {
          // Least we can do.
          return timestamp.toLocaleDateString();
        }
      };
    },

    componentWillMount: function() {
      this._getModelUserInfo();
    },

    componentWillUnmount: function() {
      this.xhrs.forEach((xhr) => {
        xhr && xhr.abort && xhr.abort();
      });
    },

    /**
      Fetch the a list, from the API, of user info for each user attached to
      the model.

      @method _getModelUserInfo
    */
    _getModelUserInfo: function() {
      this.setState({loadingUsers: true}, () => {
        const xhr = this.props.getModelUserInfo(this._getModelUserInfoCallback);
        this.xhrs.push(xhr);
      });
    },

    /**
      Handle the API-returned data about the model's users. When successful, it
      will update the component's internal state.

      @method _getModelUserCallback
    */
    _getModelUserInfoCallback: function(error, data) {
      this.setState({loadingUsers: false}, () => {
        if (error) {
          // Display the error message.
          this.props.addNotification({
            title: 'Unable to load users.',
            message: 'Unable to load user information for this model: ' + error,
            level: 'error'
          });
          // Go ahead and close the popup.
          this.props.closeHandler();
          return;
        }
        this.setState({usersWithAccess: data});
      });
    },

    /**
      Provides a callback for both revoke and grant actions. The callback
      handles any errors that occurred while applying the changes. If no
      errors occur, then update the list of users with access to the model.

      @method _modifyModelAccessCallback
      @param {String} error Any errors that occured while updating access.
      @return {Booolean} Successfully modified the model access.
    */
    _modifyModelAccessCallback: function(error) {
      let success = true;
      if (error) {
        this.setState({inviteError: error});
        success = false;
      } else {
        // Reset the form fields.
        this.refs.username.setValue('');
        this.refs.access.setValue('read');
        // Clear out any errors and refresh the user list.
        this.setState({inviteError: null}, () => {
          this._getModelUserInfo();
        });
      }
      this.setState({sending: false});
      return success;
    },

    /**
      Grants access to the specified user.

      @method _grantModelAccess
      @param {Object} evt The form submission event object.
    */
    _grantModelAccess: function(evt) {
      if (evt) {
        evt.preventDefault();
      }
      const username = this.refs.username.getValue();
      const access = this.refs.access.getValue();
      this.setState({sending: true});
      this.props.grantModelAccess(username, access,
        // Wrap the ModelAccessCallback to set the state that modify the add
        // button depending on success.
        function(error) {
          const success = this._modifyModelAccessCallback(error);
          this.setState({sent: success});
        }.bind(this));
    },

    /**
      Revokes access to the specified user.

      @method _revokeModelAccess
      @param {String} user The user who's access is being revoked.
    */
    _revokeModelAccess: function(user) {
      // Juju's revoke access API doesn't actually revoke access, it just
      // downgrades it to the next level at the moment (as of 2.0). So if you
      // want a user to have no access, you have to specify 'read'. Because:
      // admin -> write -> read -> no access.
      this.props.revokeModelAccess(user.name, 'read',
        this._modifyModelAccessCallback);
    },

    /**
      Generate the list of users with access to the model.

      @method _generateUsersWithAccess
      @returns {Array} An array of markup objects for each user.
    */
    _generateUsersWithAccess: function() {
      if (this.state.loadingUsers) {
        return (
          <div className="sharing__loading">
            <juju.components.Spinner />
          </div>
        );
      }
      const users = this.state.usersWithAccess;
      if (!users.length) {
        return;
      }
      return users.map((user) => {
        if (user.err) {
          return (
            <div key={user.name} className="sharing__user">
              <div className="sharing__user-details">
                <div className="sharing__user-name">
                  {user.displayName}
                </div>
                <div className="sharing__user-display-name">
                  {user.err}
                </div>
              </div>
            </div>
          );
        }
        let lastConnection = 'never connected';
        if (user.lastConnection) {
          const humanTime = this.props.humanizeTimestamp(user.lastConnection);
          lastConnection = `last connection: ${humanTime}`;
        }
        let revokeMarkup;
        if (this.props.canShareModel) {
          const revokeUserAccess = this._revokeModelAccess.bind(this, user);
          revokeMarkup = (
            <div className="sharing__user-revoke">
              <juju.components.GenericButton
                action={revokeUserAccess}
                tooltip="Remove user"
                icon="close_16" />
            </div>
          );
        }
        return (
          <div key={user.name} className="sharing__user">
            <div className="sharing__user-details">
              <div className="sharing__user-name">
                {user.displayName}
              </div>
              <div className="sharing__user-display-name">
                {user.domain} user
              </div>
              <div className="sharing__user-last-connection">
                {lastConnection}
              </div>
            </div>
            <div className="sharing__user-access">
              {user.access}
            </div>
            {revokeMarkup}
          </div>
        );
      });
    },

    /**
      On key up, we want to check if the input is empty and change the state
      accordingly.

      @param {Object} evt The keyup event.
    */
    _handleUsernameInputChange: function(evt) {
      this.setState({canAdd: evt.target.value !== ''});
    },

    _generateInvite: function() {
      if (!this.props.canShareModel) {
        return;
      }
      const accessOptions = [{
        label: 'Read',
        value: 'read'
      }, {
        label: 'Write',
        value: 'write'
      }, {
        label: 'Admin',
        value: 'admin'
      }];
      const error = this.state.inviteError ? (
        <div className="sharing__invite--error">
          <b>Error:</b> {this.state.inviteError}
        </div>
      ) : undefined;
      return (
        <div className="sharing__invite">
          <div className="sharing__invite--header">Add a user</div>
          <form onSubmit={this._grantModelAccess}>
            <div className="sharing__invite--username">
              <juju.components.GenericInput
                inlineErrorIcon={true}
                label="Username"
                placeholder="Username"
                ref="username"
                onKeyUp={this._handleUsernameInputChange}
                errors={!!this.state.inviteError}
                required={true} />
            </div>
            <div className="sharing__invite--access">
              <juju.components.InsetSelect
                label="Access"
                defaultValue="read"
                ref="access"
                options={accessOptions} />
            </div>
            <div className="sharing__invite--grant-button">
              {this.generateAddButton()}
            </div>
            {error}
          </form>
        </div>
      );
    },

    /**
      Generate the invite 'add' button based on the current state

      @returns {Object} The generated button.
    */
    generateAddButton: function() {
      if (this.state.sending) {
        return (<juju.components.GenericButton
          submit={true}
          title="Add"
          tooltip="Add user"
          ref="grantButton"
          type="positive"
          disabled={true} />);
      } else if (this.state.sent) {
        // We want the button to transition back to it's resting state after a
        // set amount of time, so make a closure then trigger it after 1.5s.
        const sent = (() => {
          return () => {
            this.setState({sent: false, canAdd: false});
          };
        })();
        setTimeout(sent, 1500);
        return (<juju.components.GenericButton
          submit={true}
          icon="tick_16"
          tooltip="Add user"
          ref="grantButton"
          type="positive"
          disabled={!this.state.canAdd} />);
      } else {
        return (<juju.components.GenericButton
          submit={true}
          title="Add"
          tooltip="Add user"
          ref="grantButton"
          type="positive"
          disabled={!this.state.canAdd} />);
      }
    },

    handleClose: function() {
      return true;
    },

    render: function() {
      return (
        <juju.components.Popup
          className="sharing__popup"
          close={this.props.closeHandler}
          title="Share">
          {this._generateInvite()}
          <div className="sharing__users-header">
            <div className="sharing__users-header-user">User</div>
            <div className="sharing__users-header-access">Access</div>
          </div>
          <div className="sharing__users">
            {this._generateUsersWithAccess()}
          </div>
          <juju.components.GenericButton
            title="Done"
            action={this.props.closeHandler}
            type="inline-neutral"
            extraClasses="right"
          />
        </juju.components.Popup>
      );
    }

  });

}, '0.1.0', {
  requires: [
    'generic-button',
    'generic-input',
    'inset-select',
    'loading-spinner',
    'popup'
  ]
});
