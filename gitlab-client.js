var request = require('request');
var async = require('async');


function GitlabClient(url, options) {
	this.url = url + '/api/v3/';
	this.options = options;
}

GitlabClient.prototype.auth = function(username, password, cb) {
	if (!username) { return cb('Invalid username'); }
	var isEmail = username.indexOf('@') !== -1;
	var params = {
		url: this.url + 'user',
		method: 'GET',
		headers: {
		  'Private-Token': password
		},
		ca: this.options.caFile,
		json: true
	};
	request(params, function(error, response, body) {
		if(error) return cb(error);
		if(response.statusCode < 200 || response.statusCode >= 300) return cb('Invalid status code ' + response.statusCode);
		if (isEmail && username !== body.email) { return cb('Invalid credentials'); }
		if (!isEmail && username !== body.username) { return cb('Invalid credentials'); }
		cb(null, body);
	});
};

GitlabClient.prototype.paginate = function(params, cb) {
	params.qs.per_page = 50;
	params.qs.page = 1;
	var results = [];
	var hasMore = true;
	async.whilst(function() {
		return hasMore;
	}, function(next) {
		request(params, function(error, response, body) {
			if(error) return cb(error);
			if(response.statusCode < 200 || response.statusCode >= 300) return next('Invalid status code ' + response.statusCode);
			body = JSON.parse(body);
			Array.prototype.push.apply(results, body);
			delete params.qs;
			if (!response.headers.link) {
				hasMore = false;
			} else {
				var linkParts = response.headers.link.split(/ *, */g);
				var linkNext;
				linkParts.forEach(function(part) {
					var partParts = part.split(/ *; */g);
					var rel, link;
					partParts.forEach(function(partPart) {
						var matches;
						matches = /^rel="([a-z]+)"$/.exec(partPart);
						if (matches) {
							rel = matches[1];
						}
						matches = /^<(.*)>$/.exec(partPart);
						if (matches) {
							link = matches[1];
						}
					});
					if (rel === 'next' && link) {
						linkNext = link;
					}
				});
				if (linkNext) {
					params.url = linkNext;
				} else {
					hasMore = false;
				}
			}
			next();
		});
	}, function(error) {
		if(error) return cb(error);
		cb(null, results);
	});
};

GitlabClient.prototype.listUsers = function(search, privateToken, cb) {
	this.paginate({
		url: this.url + 'users',
		qs: {
			private_token: privateToken,
			search: search
		},
		ca: this.options.caFile
	}, cb);
};

GitlabClient.prototype.listAllProjects = function(search, privateToken, cb) {
	this.paginate({
		url: this.url + 'projects/all',
		qs: {
			private_token: privateToken,
			search: search
		},
		ca: this.options.caFile
	}, cb);
};

GitlabClient.prototype.getProject = function(id, privateToken, cb) {
	request({
		url: this.url + 'projects/' + encodeURIComponent(id),
		qs: {
			private_token: privateToken
		},
		ca: this.options.caFile
	}, function(error, response, body) {
		if(error) return cb(error);
		if(response.statusCode == 404) return cb(null, null);
		if(response.statusCode < 200 || response.statusCode >= 300) return cb('Invalid status code ' + response.statusCode);
		cb(null, JSON.parse(body));
	});
};

GitlabClient.prototype.listProjects = function(search, privateToken, cb) {
	this.paginate({
		url: this.url + 'projects',
		qs: {
			private_token: privateToken,
			search: search
		},
		ca: this.options.caFile
	}, cb);
};

GitlabClient.prototype.listGroups = function(privateToken, cb) {
	this.paginate({
		url: this.url + 'groups',
		qs: {
			private_token: privateToken
		},
		ca: this.options.caFile
	}, cb);
};

GitlabClient.prototype.listParentGroups = function(groupId, privateToken, cb) {
	this.listGroups(privateToken, function(err, groups) {
		if (err) { return cb(err); }
		var groupsMap = {};
		groups.forEach(function(group) { groupsMap[group.id] = group; });
		var group = groupsMap[groupId];
		groups = [group];
		while (group.parent_id) {
			group = groupsMap[group.parent_id];
			groups.push(group);
		}
		cb(null, groups);
	});
};

GitlabClient.prototype.getProjectTeamMember = function(projectId, userId, privateToken, cb) {
	request({
		url: this.url + 'projects/' + encodeURIComponent(projectId) + '/members/' + encodeURIComponent(userId),
		qs: {
			private_token: privateToken
		},
		ca: this.options.caFile
	}, function(error, response, body) {
		if(error) return cb(error);
		if(response.statusCode == 404) return cb(null, null);
		if(response.statusCode < 200 || response.statusCode >= 300) return cb('Invalid status code ' + response.statusCode);
		cb(null, JSON.parse(body));
	});
};

GitlabClient.prototype.listGroupMembers = function(groupId, privateToken, cb) {
	this.paginate({
		url: this.url + 'groups/' + groupId + '/members',
		qs: {
			private_token: privateToken
		},
		ca: this.options.caFile
	}, cb);
};

GitlabClient.prototype.listRecursiveGroupMembers = function(groupId, privateToken, cb) {
	var client = this;
	this.listParentGroups(groupId, privateToken, function(err, groups) {
		if (err) { return cb(err); }

		async.parallel(
			groups.map(function(group) {
				return function(pcb) { client.listGroupMembers(group.id, privateToken, pcb); }
			}),
			cb
		);
	});
};

module.exports = GitlabClient;
