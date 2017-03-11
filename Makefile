all:  sump-pump-monitor.zip

sump-pump-monitor.zip:  sump-pump-monitor.js node_modules/moment
	zip -r sump-pump-monitor.zip sump-pump-monitor.js node_modules/moment

node_modules/moment:
	npm install moment

node_modules/aws-sdk:
	npm install aws-sdk

node_modules/fs:
	npm install fs

check:  sump-pump-monitor.zip node_modules/aws-sdk node_modules/fs
	node tests/test-lambda.js

clean:
	rm -f sump-pump-monitor.zip
	rm -rf node_modules

.PHONY: clean
