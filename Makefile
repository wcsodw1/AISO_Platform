.PHONY: run export check status

run:
	python3 AISO_Platform_Portal/launcher.py --no-browser

export:
	python3 AISO_Platform_Portal/scripts/export_static.py

check:
	python3 -m py_compile AISO_Platform_Portal/launcher.py AISO_Platform_Portal/exporter.py AISO_Platform_Portal/scripts/export_static.py
	node --check AISO_Platform_Portal/app.js
	node --check AISO_Platform_Portal/manage.js

status:
	git status --short --branch
