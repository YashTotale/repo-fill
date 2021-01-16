#!/bin/bash

GREEN='\e[92m'
NC='\033[0m'

set -e

lint() {
  eslinter
  printf "\n"
  markdownlinter
  printf "\n"
  prettierlinter
}

eslinter() {
  printf "Linting with ESLint...\n\n"

  eslint .

  printf "${GREEN}ESLint Done${NC}\n"
}

markdownlinter() {
  printf 'Linting with MarkdownLint...\n\n'

  markdownlint .

  printf "${GREEN}MarkdownLint Done${NC}\n"
}

prettierlinter() {
  printf 'Linting with Prettier...\n'

  prettier --check .

  printf "\n${GREEN}Prettier Done${NC}\n"
}

lint
