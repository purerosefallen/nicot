import { IdBase } from '../src/bases';
import { ManyToOne, OneToMany } from 'typeorm';
import { RelationComputed } from '../src/decorators';
import { filterRelations } from '../src/utility/filter-relations';
import { RestfulFactory } from '../src/restful';

class User extends IdBase() {
  @OneToMany(() => Book, (book) => book.user)
  books: Book[];

  name: string;

  @RelationComputed(() => Book)
  favoriteBook: Partial<Book>;
}

class Book extends IdBase() {
  @ManyToOne(() => User, (user) => user.books)
  user: User;

  name: string;
}

describe('Relation filter', () => {
  it('should filter relations correctly', () => {
    expect(
      filterRelations(User, ['books', 'favoriteBook'], (r) => !r.computed),
    ).toStrictEqual(['books']);
    expect(
      filterRelations(User, ['books', 'books.user'], (r) => !r.computed),
    ).toStrictEqual(['books', 'books.user']);
    expect(
      filterRelations(
        Book,
        ['user', 'user.books', 'user.favoriteBook'],
        (r) => !r.computed,
      ),
    ).toStrictEqual(['user', 'user.books']);
  });

  it('should throw when incorrect relations present', () => {
    expect(() => filterRelations(User, ['books', 'name'])).toThrow(
      'Relation name not found in User (Reading name in User)',
    );
    expect(() => filterRelations(User, ['books', 'books.name'])).toThrow(
      'Relation name not found in Book (Reading books.name in User)',
    );
  });

  it('should throw in RestfulFactory', () => {
    expect(
      () => new RestfulFactory(User, { relations: ['books', 'name'] }),
    ).toThrow('Relation name not found in User (Reading name in User)');
    expect(
      () =>
        new RestfulFactory(User, {
          relations: ['books', 'books.name'],
        }),
    ).toThrow('Relation name not found in Book (Reading name in Book)');
  });
});
