REPORTER = spec

doc:
	makedoc lib/abstract-class.js lib/schema.js lib/validatable.js -t "JugglingDB API docs"

test:
	./node_modules/.bin/mocha --reporter $(REPORTER)

.PHONY: doc test
