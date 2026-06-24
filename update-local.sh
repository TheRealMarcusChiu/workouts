#! /bin/bash

ssh my-websites << EOF
  cd /root/workouts
  git pull --rebase
  systemctl restart workouts-admin.service
EOF

