CREATE DATABASE IF NOT EXISTS railway;
USE railway;

DROP TABLE IF EXISTS historico_buscas;
DROP TABLE IF EXISTS respostas_ia;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS pecas;
DROP TABLE IF EXISTS usuarios;


CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    senha VARCHAR(255),
    email VARCHAR(150) UNIQUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE historico_buscas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    termo VARCHAR(150) NOT NULL,
    data_busca TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
);

CREATE TABLE pecas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    fabricante VARCHAR(120),
    modelo_carro VARCHAR(120) NOT NULL,
    ano_inicio INT,
    ano_fim INT,
    preco DECIMAL(10,2),
    estoque INT DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE respostas_ia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    termo_busca VARCHAR(150),
    resposta LONGTEXT,
    data_resposta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE SET NULL
);

CREATE TABLE sessoes (
    id VARCHAR(200) PRIMARY KEY,
    usuario_id INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMP NULL DEFAULT NULL,

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE
);
