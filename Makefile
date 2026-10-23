.PHONY: run export check status

run:
	python3 AISO_Platform_Portal/launcher.py --no-browser

export:
	python3 AISO_Platform_Portal/scripts/export_static.py

check:
	python3 -m py_compile AISO_Platform_Portal/launcher.py AISO_Platform_Portal/exporter.py AISO_Platform_Portal/scripts/export_static.py
	python3 -m py_compile AISO_Platform_Portal/benchmark/api.py AISO_Platform_Portal/benchmark/jobs.py AISO_Platform_Portal/benchmark/reports.py
	python3 -m py_compile AISO-Platform-UI/blender/script/aiso_blender_agent.py AISO-Platform-UI/blender/script/aiso_blender_agent_panel.py
	node --check AISO_Platform_Portal/app.js
	node --check AISO_Platform_Portal/benchmark-app.js
	node --check AISO_Platform_Portal/manage.js
	python3 -m unittest discover -s AISO_Platform_Portal/tests -p "test_*.py"

status:
	git status --short --branch
