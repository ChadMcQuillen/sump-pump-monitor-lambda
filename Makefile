build: clean
	npm install moment
	zip -r sump-pump-monitor.zip sump-pump-monitor.js node_modules

clean:
	rm -f sump-pump-monitor.zip

.PHONY: build clean
